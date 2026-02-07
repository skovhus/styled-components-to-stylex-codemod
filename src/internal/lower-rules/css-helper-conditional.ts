/**
 * Resolves conditional css`` helper blocks for lower-rules.
 * Core concepts: analyzing conditional branches, extracting variant conditions,
 * and emitting StyleX-compatible style objects or style functions.
 */
import type { ASTNode } from "jscodeshift";
import type { ImportSpec } from "../../adapter.js";
import type { StyledDecl } from "../transform-types.js";
import type { ExpressionKind, StyleFnFromPropsEntry, TestInfo } from "./decl-types.js";
import type { InternalHandlerContext } from "../builtin-handlers.js";
import type { LowerRulesState } from "./state.js";
import { resolveDynamicNode } from "../builtin-handlers.js";
import { cssDeclarationToStylexDeclarations } from "../css-prop-mapping.js";
import { parseCssTemplateToRules, type ConditionalVariant } from "./css-helper.js";
import { extractStaticParts } from "./interpolations.js";
import {
  buildTemplateWithStaticParts,
  collectPropsFromArrowFn,
  collectPropsFromExpressions,
  normalizeDollarProps,
} from "./inline-styles.js";
import { mergeStyleObjects } from "./utils.js";
import { extractConditionName } from "../utilities/style-key-naming.js";
import {
  cloneAstNode,
  collectIdentifiers,
  getArrowFnParamBindings,
  getNodeLocStart,
  isCallExpressionNode,
  staticValueToLiteral,
  type ASTNodeRecord,
} from "../utilities/jscodeshift-utils.js";
import { cssValueToJs, toSuffixFromProp } from "../transform/helpers.js";
import { createPropTestHelpers, invertWhen } from "./variant-utils.js";
import { cssPropertyToIdentifier, makeCssProperty, makeCssPropKey } from "./shared.js";
import {
  resolveTemplateLiteralBranch,
  type ComponentInfo,
  type TemplateLiteralContext,
} from "./template-literals.js";
import {
  ensureShouldForwardPropDrop,
  literalToStaticValue,
  resolveTypeNodeFromTsType,
} from "./types.js";
import { buildThemeStyleKeys } from "../utilities/style-key-naming.js";
import { capitalize } from "../utilities/string-utils.js";

export type CssHelperConditionalContext = Pick<
  LowerRulesState,
  | "j"
  | "filePath"
  | "warnings"
  | "parseExpr"
  | "resolveValue"
  | "resolveCall"
  | "resolveImportInScope"
  | "resolverImports"
  | "isCssHelperTaggedTemplate"
  | "resolveCssHelperTemplate"
  | "markBail"
> & {
  decl: StyledDecl;
  handlerContext: InternalHandlerContext;
  componentInfo: ComponentInfo;
  styleObj: Record<string, unknown>;
  styleFnFromProps: StyleFnFromPropsEntry[];
  styleFnDecls: Map<string, unknown>;
  inlineStyleProps: Array<{ prop: string; expr: ExpressionKind; jsxProp?: string }>;
  resolveStaticCssBlock: (rawCss: string) => Record<string, unknown> | null;
  isPlainTemplateLiteral: (node: ExpressionKind | null | undefined) => boolean;
  isThemeAccessTest: (test: ExpressionKind, paramName: string | null) => boolean;
  applyVariant: (testInfo: TestInfo, styleObj: Record<string, unknown>) => void;
  dropAllTestInfoProps: (testInfo: TestInfo) => void;
  annotateParamFromJsxProp: (paramId: unknown, jsxProp: string) => void;
  findJsxPropTsType: (jsxProp: string) => unknown;
  isJsxPropOptional: (jsxProp: string) => boolean;
  extraStyleObjects: Map<string, Record<string, unknown>>;
  resolvedStyleObjects: Map<string, unknown>;
};

export function createCssHelperConditionalHandler(ctx: CssHelperConditionalContext) {
  const {
    j,
    decl,
    filePath,
    warnings,
    parseExpr,
    resolveValue,
    resolveCall,
    resolveImportInScope,
    resolverImports,
    componentInfo,
    handlerContext,
    styleObj,
    styleFnFromProps,
    styleFnDecls,
    inlineStyleProps,
    isCssHelperTaggedTemplate,
    resolveCssHelperTemplate,
    resolveStaticCssBlock,
    isPlainTemplateLiteral,
    isThemeAccessTest,
    applyVariant,
    dropAllTestInfoProps,
    annotateParamFromJsxProp,
    findJsxPropTsType,
    isJsxPropOptional,
    markBail,
    extraStyleObjects,
    resolvedStyleObjects,
  } = ctx;

  /**
   * Resolve the TS type node for a prop used in a style function parameter object.
   * Uses the component's type annotation to infer the correct type (e.g. `number | string`).
   * For optional props, includes `| undefined` in the union.
   * Falls back to `number` when the prop type cannot be determined.
   */
  const resolveStyleFnPropType = (jsxProp: string): unknown => {
    const resolved =
      cloneAstNode(resolveTypeNodeFromTsType(j, findJsxPropTsType(jsxProp))) ?? j.tsNumberKeyword();

    // Wrap with `| undefined` for optional props
    if (isJsxPropOptional(jsxProp)) {
      const members =
        (resolved as { type: string }).type === "TSUnionType"
          ? [...(resolved as { types: unknown[] }).types, j.tsUndefinedKeyword()]
          : [resolved, j.tsUndefinedKeyword()];
      return j.tsUnionType(members as any[]);
    }

    return resolved;
  };

  const tplCtx: TemplateLiteralContext = {
    j,
    filePath,
    parseExpr,
    resolveValue,
    resolveCall,
    resolveImportInScope,
    resolverImports,
    componentInfo,
    handlerContext,
  };

  return (d: any): boolean => {
    if (d.value.kind !== "interpolated") {
      return false;
    }
    if (d.property) {
      return false;
    }
    const parts = d.value.parts ?? [];
    if (parts.length !== 1 || parts[0]?.kind !== "slot") {
      return false;
    }
    const slotId = parts[0].slotId;
    const expr = decl.templateExpressions[slotId] as any;
    if (!expr || expr.type !== "ArrowFunctionExpression") {
      return false;
    }
    const bindings = getArrowFnParamBindings(expr);
    if (!bindings) {
      return false;
    }
    const paramName = bindings.kind === "simple" ? bindings.paramName : null;

    const { parseChainedTestInfo } = createPropTestHelpers(bindings);

    const isTriviallyPureVoidArg = (arg: any): boolean => {
      if (!arg || typeof arg !== "object") {
        return false;
      }
      // Allow `void 0`, `void null`, `void ""`, `void 1`, `void false`.
      if (arg.type === "NumericLiteral" && arg.value === 0) {
        return true;
      }
      if (arg.type === "NullLiteral") {
        return true;
      }
      if (arg.type === "StringLiteral" && arg.value === "") {
        return true;
      }
      if (arg.type === "BooleanLiteral" && arg.value === false) {
        return true;
      }
      if (arg.type === "Literal") {
        const v = (arg as { value?: unknown }).value;
        return v === 0 || v === null || v === "" || v === false;
      }
      return false;
    };

    const isEmptyCssBranch = (node: ExpressionKind): boolean => {
      if (!node || typeof node !== "object") {
        return false;
      }
      if (node.type === "StringLiteral" && node.value === "") {
        return true;
      }
      if (node.type === "Literal" && node.value === "") {
        return true;
      }
      if (node.type === "TemplateLiteral") {
        const exprs = node.expressions ?? [];
        if (exprs.length > 0) {
          return false;
        }
        const raw = (node.quasis ?? []).map((q: any) => q.value?.raw ?? "").join("");
        return raw.length === 0;
      }
      if (node.type === "NullLiteral") {
        return true;
      }
      if (node.type === "Identifier" && node.name === "undefined") {
        return true;
      }
      if (node.type === "BooleanLiteral" && node.value === false) {
        return true;
      }
      if (node.type === "UnaryExpression" && node.operator === "void") {
        return isTriviallyPureVoidArg((node as any).argument);
      }
      return false;
    };

    const readReturnExpr = (stmt: ASTNode | null | undefined): ExpressionKind | null => {
      if (!stmt || typeof stmt !== "object") {
        return null;
      }
      if (stmt.type === "ReturnStatement") {
        const arg = (stmt as { argument?: ASTNode }).argument ?? null;
        return arg && typeof arg === "object" ? (arg as ExpressionKind) : null;
      }
      if (stmt.type === "BlockStatement") {
        const body = (stmt as { body?: ASTNode[] }).body ?? [];
        if (!Array.isArray(body)) {
          return null;
        }
        const ret = body.find((s) => s?.type === "ReturnStatement");
        if (!ret) {
          return null;
        }
        const arg = (ret as { argument?: ASTNode }).argument ?? null;
        return arg && typeof arg === "object" ? (arg as ExpressionKind) : null;
      }
      return null;
    };

    type IfStatementNode = {
      type: "IfStatement";
      test: ExpressionKind;
      consequent: ASTNode;
      alternate?: ASTNode | null;
    };

    const extractConditionalFromIfBlock = (
      block: ASTNode | null | undefined,
    ): { test: ExpressionKind; consequent: ExpressionKind; alternate: ExpressionKind } | null => {
      if (!block || block.type !== "BlockStatement") {
        return null;
      }
      const stmts = Array.isArray((block as { body?: ASTNode[] }).body)
        ? (block as { body: ASTNode[] }).body
        : [];
      if (stmts.length === 1 && stmts[0]?.type === "IfStatement") {
        const ifStmt = stmts[0] as IfStatementNode;
        const consExpr = readReturnExpr(ifStmt.consequent);
        if (!consExpr) {
          return null;
        }
        const altExpr = ifStmt.alternate ? readReturnExpr(ifStmt.alternate) : null;
        if (ifStmt.alternate && !altExpr) {
          return null;
        }
        return {
          test: ifStmt.test,
          consequent: consExpr,
          alternate: altExpr ?? (j.identifier("undefined") as ExpressionKind),
        };
      }
      if (
        stmts.length === 2 &&
        stmts[0]?.type === "IfStatement" &&
        !(stmts[0] as IfStatementNode).alternate &&
        stmts[1]?.type === "ReturnStatement"
      ) {
        const ifStmt = stmts[0] as IfStatementNode;
        const consExpr = readReturnExpr(ifStmt.consequent);
        const altExpr = readReturnExpr(stmts[1]);
        if (!consExpr || !altExpr) {
          return null;
        }
        return {
          test: ifStmt.test,
          consequent: consExpr,
          alternate: altExpr,
        };
      }
      return null;
    };

    const replaceParamWithProps = (exprNode: ExpressionKind): ExpressionKind => {
      const cloned = cloneAstNode(exprNode);
      // AST traversal requires flexible typing due to jscodeshift's complex type system
      const replace = (node: unknown, parent?: unknown): unknown => {
        if (!node || typeof node !== "object") {
          return node;
        }
        if (Array.isArray(node)) {
          return node.map((child) => replace(child, parent));
        }
        const n = node as ASTNodeRecord;
        if (
          bindings.kind === "simple" &&
          (n.type === "MemberExpression" || n.type === "OptionalMemberExpression") &&
          (n.object as ASTNodeRecord)?.type === "Identifier" &&
          (n.object as { name?: string })?.name === bindings.paramName &&
          (n.property as ASTNodeRecord)?.type === "Identifier" &&
          ((n.property as { name?: string })?.name ?? "").startsWith("$") &&
          n.computed === false
        ) {
          return j.identifier((n.property as { name: string }).name);
        }
        if (n.type === "Identifier") {
          const nodeName = (n as { name?: string }).name ?? "";
          if (bindings.kind === "simple" && nodeName === bindings.paramName) {
            const p = parent as ASTNodeRecord | undefined;
            const isMemberProp =
              p &&
              (p.type === "MemberExpression" || p.type === "OptionalMemberExpression") &&
              p.property === n &&
              p.computed === false;
            const isObjectKey = p && p.type === "Property" && p.key === n && p.shorthand !== true;
            if (!isMemberProp && !isObjectKey) {
              return j.identifier("props");
            }
          }
          if (bindings.kind === "destructured" && bindings.bindings.has(nodeName)) {
            const propName = bindings.bindings.get(nodeName)!;
            const defaultValue = bindings.defaults?.get(propName);
            if (propName.startsWith("$")) {
              const base = j.identifier(propName);
              if (defaultValue) {
                return j.logicalExpression(
                  "??",
                  base,
                  cloneAstNode(defaultValue) as ExpressionKind,
                );
              }
              return base;
            }
            const memberExpr = j.memberExpression(j.identifier("props"), j.identifier(propName));
            if (defaultValue) {
              return j.logicalExpression(
                "??",
                memberExpr,
                cloneAstNode(defaultValue) as ExpressionKind,
              );
            }
            return memberExpr;
          }
        }
        if (n.type === "MemberExpression" || n.type === "OptionalMemberExpression") {
          n.object = replace(n.object, n);
          if (n.computed) {
            n.property = replace(n.property, n);
          }
          return n;
        }
        if (n.type === "Property") {
          if (n.computed) {
            n.key = replace(n.key, n);
          }
          n.value = replace(n.value, n);
          return n;
        }
        for (const key of Object.keys(n)) {
          if (key === "loc" || key === "comments") {
            continue;
          }
          const child = n[key];
          if (child && typeof child === "object") {
            n[key] = replace(child, n);
          }
        }
        return n;
      };
      return replace(cloned, undefined) as ExpressionKind;
    };

    const resolveCssBranchToInlineMap = (
      node: ExpressionKind,
    ): Map<string, ExpressionKind> | null => {
      let tpl: ASTNode | null = null;
      if (isCssHelperTaggedTemplate(node)) {
        tpl = (node as { quasi: ASTNode }).quasi;
      } else if (node?.type === "TemplateLiteral") {
        tpl = node;
      }
      if (!tpl || tpl.type !== "TemplateLiteral") {
        return null;
      }

      const { rules, slotExprById } = parseCssTemplateToRules(tpl);
      const out = new Map<string, ExpressionKind>();

      for (const rule of rules) {
        if (rule.atRuleStack.length > 0) {
          return null;
        }
        const selector = (rule.selector ?? "").trim();
        if (selector !== "&") {
          return null;
        }
        for (const d of rule.declarations) {
          if (!d.property) {
            return null;
          }
          if (d.important) {
            return null;
          }
          if (d.value.kind === "static") {
            for (const mapped of cssDeclarationToStylexDeclarations(d)) {
              let value = cssValueToJs(mapped.value, d.important, mapped.prop);
              if (mapped.prop === "content" && typeof value === "string") {
                const m = value.match(/^['"]([\s\S]*)['"]$/);
                if (m) {
                  value = `"${m[1]}"`;
                } else if (!value.startsWith('"') && !value.endsWith('"')) {
                  value = `"${value}"`;
                }
              }
              if (
                typeof value === "string" ||
                typeof value === "number" ||
                typeof value === "boolean"
              ) {
                out.set(mapped.prop, staticValueToLiteral(j, value) as ExpressionKind);
              } else {
                return null;
              }
            }
            continue;
          }
          if (d.value.kind !== "interpolated") {
            return null;
          }
          const parts = d.value.parts ?? [];
          const slotParts = parts.filter(
            (p): p is { kind: "slot"; slotId: number } => p.kind === "slot",
          );
          if (slotParts.length !== 1) {
            return null;
          }
          // Safe: length check above guarantees slotParts[0] exists
          const slotExpr = slotExprById.get(slotParts[0]!.slotId);
          if (!slotExpr || typeof slotExpr !== "object") {
            return null;
          }
          const rawExpr = replaceParamWithProps(slotExpr as ExpressionKind);
          const { prefix, suffix } = extractStaticParts(d.value);
          const valueExpr =
            prefix || suffix ? buildTemplateWithStaticParts(j, rawExpr, prefix, suffix) : rawExpr;
          for (const mapped of cssDeclarationToStylexDeclarations(d)) {
            out.set(mapped.prop, valueExpr);
          }
        }
      }
      return out;
    };

    // Handle LogicalExpression: props.$x && css`...` or chained: props.$x && props.$y && css`...`
    const body = expr.body;
    if (body?.type === "LogicalExpression" && body.operator === "&&") {
      // Use parseChainedTestInfo to handle both simple and chained && conditions
      const testInfo = parseChainedTestInfo(body.left);
      if (!testInfo) {
        return false;
      }
      if (isCssHelperTaggedTemplate(body.right)) {
        const cssNode = body.right as { quasi: ExpressionKind };
        const resolved = resolveCssHelperTemplate(cssNode.quasi, paramName, decl.loc);
        if (!resolved) {
          markBail();
          return true;
        }
        const { style: consStyle, dynamicProps, conditionalVariants } = resolved;

        if (dynamicProps.length > 0) {
          const propName = testInfo.propName;
          const hasMismatchedProp = dynamicProps.some((p) => p.jsxProp !== propName);
          const isComparison = testInfo.when.includes("===") || testInfo.when.includes("!==");
          if (!propName || hasMismatchedProp || testInfo.when.startsWith("!") || isComparison) {
            return false;
          }
          for (const dyn of dynamicProps) {
            const fnKey = `${decl.styleKey}${toSuffixFromProp(dyn.stylexProp)}`;
            if (!styleFnDecls.has(fnKey)) {
              const dynParamName = cssPropertyToIdentifier(dyn.stylexProp);
              const param = j.identifier(dynParamName);
              annotateParamFromJsxProp(param, dyn.jsxProp);
              const p = makeCssProperty(j, dyn.stylexProp, dynParamName);
              const bodyExpr = j.objectExpression([p]);
              styleFnDecls.set(fnKey, j.arrowFunctionExpression([param], bodyExpr));
            }
            if (
              !styleFnFromProps.some(
                (p) => p.fnKey === fnKey && p.jsxProp === dyn.jsxProp && p.condition === "truthy",
              )
            ) {
              styleFnFromProps.push({
                fnKey,
                jsxProp: dyn.jsxProp,
                condition: "truthy",
              });
            }
            ensureShouldForwardPropDrop(decl, dyn.jsxProp);
          }
        }

        if (Object.keys(consStyle).length > 0) {
          applyVariant(testInfo, consStyle);
        }

        // Apply conditional variants from nested ternaries within the css block
        for (const cv of conditionalVariants) {
          // Compose the outer condition with the inner condition
          const composedWhen = `${testInfo.when} && ${cv.when}`;
          applyVariant({ when: composedWhen, propName: cv.propName }, cv.style);
          ensureShouldForwardPropDrop(decl, cv.propName);
        }

        return true;
      }

      if (
        body.right?.type === "StringLiteral" ||
        (body.right?.type === "Literal" && typeof body.right.value === "string")
      ) {
        const rawCss = body.right.value as string;
        const consStyle = resolveStaticCssBlock(rawCss);
        if (!consStyle) {
          return false;
        }
        if (Object.keys(consStyle).length > 0) {
          applyVariant(testInfo, consStyle);
        }
        return true;
      }

      // Handle TemplateLiteral (with or without interpolations): props.$x && `z-index: ${props.$x};`
      if (body.right?.type === "TemplateLiteral") {
        const tpl = body.right as {
          expressions?: unknown[];
          quasis?: Array<{ value?: { raw?: string; cooked?: string } }>;
        };

        // Handle template literals with interpolations
        if (tpl.expressions && tpl.expressions.length > 0) {
          // Use resolveTemplateLiteralBranch to parse the template
          const resolved = resolveTemplateLiteralBranch(tplCtx, {
            node: body.right,
            paramName,
          });
          if (!resolved) {
            return false;
          }
          const { style, dynamicEntries, inlineEntries } = resolved;

          // Handle dynamic entries (e.g., z-index: ${props.$zIndex})
          if (dynamicEntries.length > 0) {
            // For `prop !== undefined` test, allow dynamic props if they match
            const isUndefinedCheck =
              testInfo.when.endsWith(" !== undefined") ||
              testInfo.when.endsWith(' !== "undefined"');
            const testProp = testInfo.propName;

            // Check if all dynamic props match the test prop
            const allMatch = dynamicEntries.every((e) => e.jsxProp === testProp);
            if (!allMatch && !isUndefinedCheck) {
              return false;
            }

            // Create style functions for dynamic entries
            for (const entry of dynamicEntries) {
              const fnKey = `${decl.styleKey}${toSuffixFromProp(entry.stylexProp)}`;
              if (!styleFnDecls.has(fnKey)) {
                const entryParamName = cssPropertyToIdentifier(entry.stylexProp);
                const param = j.identifier(entryParamName);
                annotateParamFromJsxProp(param, entry.jsxProp);
                const p = makeCssProperty(j, entry.stylexProp, entryParamName);
                const bodyExpr = j.objectExpression([p]);
                styleFnDecls.set(fnKey, j.arrowFunctionExpression([param], bodyExpr));
              }
              // Track as conditional: apply when test is truthy
              // For !== undefined checks, we still use "truthy" since we check the full condition
              const condition = "truthy" as const;
              if (
                !styleFnFromProps.some(
                  (p) =>
                    p.fnKey === fnKey && p.jsxProp === entry.jsxProp && p.condition === condition,
                )
              ) {
                styleFnFromProps.push({
                  fnKey,
                  jsxProp: entry.jsxProp,
                  condition,
                  conditionWhen: testInfo.when,
                });
              }
              ensureShouldForwardPropDrop(decl, entry.jsxProp);
            }
          }

          // Handle inline entries (not yet supported in conditional context)
          if (inlineEntries.length > 0) {
            return false;
          }

          // Apply static styles
          if (Object.keys(style).length > 0) {
            applyVariant(testInfo, style);
          }

          return true;
        }

        // Handle static template literals (no interpolations)
        const rawCss = tpl.quasis?.map((q) => q.value?.cooked ?? q.value?.raw ?? "").join("") ?? "";
        if (!rawCss.trim()) {
          return true; // Empty template literal is valid (no styles to apply)
        }
        const consStyle = resolveStaticCssBlock(rawCss);
        if (!consStyle) {
          return false;
        }
        if (Object.keys(consStyle).length > 0) {
          applyVariant(testInfo, consStyle);
        }
        return true;
      }

      return false;
    }

    // Helper to apply dynamic style entries from template literal interpolations.
    // When conditionWhen is provided, styles are conditional; otherwise unconditional.
    const applyDynamicEntries = (
      entries: Array<{ jsxProp: string; stylexProp: string; callArg: ExpressionKind }>,
      conditionWhen?: string,
    ): void => {
      for (const entry of entries) {
        const fnKey = `${decl.styleKey}${toSuffixFromProp(entry.stylexProp)}`;
        if (!styleFnDecls.has(fnKey)) {
          const entryParamName = cssPropertyToIdentifier(entry.stylexProp);
          const param = j.identifier(entryParamName);
          annotateParamFromJsxProp(param, entry.jsxProp);
          const p = makeCssProperty(j, entry.stylexProp, entryParamName);
          const bodyExpr = j.objectExpression([p]);
          styleFnDecls.set(fnKey, j.arrowFunctionExpression([param], bodyExpr));
        }
        if (
          !styleFnFromProps.some(
            (p) =>
              p.fnKey === fnKey && p.jsxProp === entry.jsxProp && p.conditionWhen === conditionWhen,
          )
        ) {
          styleFnFromProps.push({
            fnKey,
            jsxProp: entry.jsxProp,
            conditionWhen,
            callArg: entry.callArg,
          });
        }
        ensureShouldForwardPropDrop(decl, entry.jsxProp);
      }
    };

    const buildConditionExprFromWhen = (
      when: string,
    ): { cond: ExpressionKind; isBoolean: boolean } | null => {
      const trimmed = when.trim();
      if (!trimmed) {
        return null;
      }
      if (trimmed.startsWith("!")) {
        const propName = trimmed.slice(1).trim();
        if (!propName) {
          return null;
        }
        return {
          cond: j.unaryExpression("!", j.identifier(propName)),
          isBoolean: true,
        };
      }
      if (trimmed.includes("===") || trimmed.includes("!==")) {
        const op = trimmed.includes("!==") ? "!==" : "===";
        const [lhs, rhsRaw0] = trimmed.split(op).map((s) => s.trim());
        const rhsRaw = rhsRaw0 ?? "";
        if (!lhs) {
          return null;
        }
        let rhs: ExpressionKind;
        try {
          rhs = j.literal(JSON.parse(rhsRaw));
        } catch {
          rhs = parseExpr(rhsRaw) ?? j.identifier(rhsRaw);
        }
        return {
          cond: j.binaryExpression(op as any, j.identifier(lhs), rhs),
          isBoolean: true,
        };
      }
      return { cond: j.identifier(trimmed), isBoolean: false };
    };

    const applyInlineEntries = (
      entries: Array<{ jsxProp: string; prop: string; callArg: ExpressionKind }>,
      conditionWhen?: string,
    ): void => {
      const condition = conditionWhen ? buildConditionExprFromWhen(conditionWhen) : null;
      for (const entry of entries) {
        const expr =
          condition && condition.cond
            ? j.conditionalExpression(condition.cond, entry.callArg, j.identifier("undefined"))
            : entry.callArg;
        inlineStyleProps.push({ prop: entry.prop, expr, jsxProp: entry.jsxProp });
        ensureShouldForwardPropDrop(decl, entry.jsxProp);
      }
      if (entries.length > 0) {
        decl.needsWrapperComponent = true;
      }
    };

    // Handle direct TemplateLiteral body: (props) => `width: ${props.$width}px;`
    // Applies styles unconditionally - static styles merge into base, dynamic become style functions.
    if (body?.type === "TemplateLiteral") {
      const resolved = resolveTemplateLiteralBranch(tplCtx, {
        node: body,
        paramName,
      });

      if (!resolved) {
        return false;
      }

      const { style, dynamicEntries, inlineEntries } = resolved;

      // Static styles go to base object (no condition = always applied)
      for (const [prop, value] of Object.entries(style)) {
        styleObj[prop] = value;
      }

      if (inlineEntries.length > 0) {
        applyInlineEntries(inlineEntries);
      }

      // Dynamic props become style functions (unconditional - no conditionWhen)
      applyDynamicEntries(dynamicEntries);

      if (dynamicEntries.length > 0) {
        decl.needsWrapperComponent = true;
      }

      return true;
    }

    // Handle BlockStatement with simple return of css`...` (no condition)
    // Pattern: (props) => { return css`font-size: ${props.$size}px;`; }
    if (body?.type === "BlockStatement") {
      const stmts = Array.isArray((body as { body?: ASTNode[] }).body)
        ? (body as { body: ASTNode[] }).body
        : [];
      // Only handle single ReturnStatement (not if blocks - those go to conditional handling below)
      if (stmts.length === 1 && stmts[0]?.type === "ReturnStatement") {
        const returnArg = (stmts[0] as { argument?: ASTNode }).argument;
        if (returnArg && isCssHelperTaggedTemplate(returnArg)) {
          // Use resolveCssBranchToInlineMap (same as conditional handling)
          // since it properly preserves expressions like ${props.$size - 3}px
          const styleMap = resolveCssBranchToInlineMap(returnArg as ExpressionKind);
          if (!styleMap) {
            return false;
          }

          if (styleMap.size === 0) {
            return true;
          }

          // Collect props used in value expressions
          const propsUsed = collectPropsFromArrowFn(expr);
          collectPropsFromExpressions(styleMap.values(), propsUsed);

          // All props used in value expressions become parameters
          const valuePropParams = Array.from(propsUsed);

          if (valuePropParams.length === 0) {
            // No dynamic props - add styles directly to base object
            for (const [prop, valueExpr] of styleMap.entries()) {
              styleObj[prop] = valueExpr;
            }
            return true;
          }

          // Create parameterized StyleX style function with props object parameter
          // Type inferred from component's prop types (e.g. { size: number | string })
          const propsTypeProperties = valuePropParams.map((p) => {
            const propName = p.startsWith("$") ? p.slice(1) : p;
            const prop = j.tsPropertySignature(
              j.identifier(propName),
              j.tsTypeAnnotation(resolveStyleFnPropType(p) as any),
            );
            return prop;
          });
          const propsParam = j.identifier("props");
          (propsParam as { typeAnnotation?: unknown }).typeAnnotation = j.tsTypeAnnotation(
            j.tsTypeLiteral(propsTypeProperties),
          );

          // Keep expressions as-is (props.X stays as props.X), just handle $-prefixed props
          const properties = Array.from(styleMap.entries()).map(([prop, propExpr]) => {
            const replacedExpr = normalizeDollarProps(j, propExpr);
            return j.property("init", makeCssPropKey(j, prop), replacedExpr);
          });
          const styleFn = j.arrowFunctionExpression([propsParam], j.objectExpression(properties));

          // Add to resolved style objects
          const fnKey = `${decl.styleKey}Styles`;
          resolvedStyleObjects.set(fnKey, styleFn);

          // Create function call expression with props object: { size, padding }
          const callArgProperties = valuePropParams.map((p) => {
            const propName = p.startsWith("$") ? p.slice(1) : p;
            return j.property.from({
              kind: "init",
              key: j.identifier(propName),
              value: j.identifier(p),
              shorthand: propName === p,
            });
          });
          const styleCall = j.callExpression(
            j.memberExpression(j.identifier("styles"), j.identifier(fnKey)),
            [j.objectExpression(callArgProperties)],
          );

          if (!decl.extraStylexPropsArgs) {
            decl.extraStylexPropsArgs = [];
          }
          decl.extraStylexPropsArgs.push({ expr: styleCall });

          decl.needsWrapperComponent = true;
          for (const propName of propsUsed) {
            ensureShouldForwardPropDrop(decl, propName);
          }
          return true;
        }
      }
    }

    // Handle ConditionalExpression: props.$x ? css`...` : css`...`
    const conditional =
      body?.type === "ConditionalExpression"
        ? body
        : body?.type === "BlockStatement"
          ? extractConditionalFromIfBlock(body)
          : null;
    if (!conditional) {
      return false;
    }

    const testInfo = parseChainedTestInfo(conditional.test);

    // Handle block-level theme conditionals (e.g., props.theme.isDark ? "color: white;" : "color: black;")
    // by resolving both branches and emitting theme-conditional style objects.
    if (isThemeAccessTest(conditional.test, paramName)) {
      const handled = tryResolveBlockLevelThemeConditional({
        conditional,
        paramName,
        replaceParamWithProps,
        isEmptyCssBranch,
        isPlainTemplateLiteral,
        isCssHelperTaggedTemplate,
        resolveStaticCssBlock,
        decl,
        extraStyleObjects,
        j,
        filePath,
        parseExpr,
        resolveValue,
        resolveCall,
        resolveImportInScope,
        resolverImports,
        componentInfo,
        handlerContext,
      });
      if (handled) {
        return true;
      }
      // Fall through to bail if resolution failed
      const loc = getNodeLocStart(conditional.test);
      warnings.push({
        severity: "warning",
        type: "Theme-dependent block-level conditional could not be fully resolved (branches may contain dynamic interpolations)",
        loc: loc ?? decl.loc,
        context: {},
      });
      markBail();
      return true;
    }

    const cons = conditional.consequent;
    const alt = conditional.alternate;
    const consIsCss = isCssHelperTaggedTemplate(cons);
    const altIsCss = isCssHelperTaggedTemplate(alt);
    const consIsTpl = isPlainTemplateLiteral(cons);
    const altIsTpl = isPlainTemplateLiteral(alt);
    const consIsEmpty = isEmptyCssBranch(cons);
    const altIsEmpty = isEmptyCssBranch(alt);

    if (!testInfo) {
      // Non-prop conditional: generate StyleX parameterized style functions.
      // Only support css`` or template-literal CSS branches.
      const consMap =
        consIsCss || consIsTpl ? resolveCssBranchToInlineMap(cons) : consIsEmpty ? new Map() : null;
      const altMap =
        altIsCss || altIsTpl ? resolveCssBranchToInlineMap(alt) : altIsEmpty ? new Map() : null;
      if (!consMap || !altMap) {
        return false;
      }

      // Collect props used in value expressions
      const propsUsed = collectPropsFromArrowFn(expr);
      collectPropsFromExpressions([...consMap.values(), ...altMap.values()], propsUsed);

      // All props used in value expressions become parameters
      const valuePropParams = Array.from(propsUsed);

      if (consMap.size === 0 && altMap.size === 0) {
        return true;
      }

      // Create parameterized StyleX style function with props object parameter
      const createStyleFn = (map: Map<string, ExpressionKind>) => {
        const propsTypeProperties = valuePropParams.map((p) => {
          const propName = p.startsWith("$") ? p.slice(1) : p;
          const prop = j.tsPropertySignature(
            j.identifier(propName),
            j.tsTypeAnnotation(resolveStyleFnPropType(p) as any),
          );
          return prop;
        });
        const propsParam = j.identifier("props");
        (propsParam as { typeAnnotation?: unknown }).typeAnnotation = j.tsTypeAnnotation(
          j.tsTypeLiteral(propsTypeProperties),
        );

        const properties = Array.from(map.entries()).map(([prop, propExpr]) => {
          const replacedExpr = normalizeDollarProps(j, propExpr);
          return j.property("init", makeCssPropKey(j, prop), replacedExpr);
        });
        return j.arrowFunctionExpression([propsParam], j.objectExpression(properties));
      };

      // Generate style function keys with descriptive names when possible
      const conditionName = extractConditionName(conditional.test);
      // When conditionName is null (e.g., call expression conditions), disambiguate keys
      // using CSS property names to avoid collisions when multiple conditionals exist
      const propSuffix =
        !conditionName && consMap.size > 0
          ? capitalize(cssPropertyToIdentifier(Array.from(consMap.keys())[0]!))
          : !conditionName && altMap.size > 0
            ? capitalize(cssPropertyToIdentifier(Array.from(altMap.keys())[0]!))
            : "";
      const rawConsKey = conditionName
        ? `${decl.styleKey}${conditionName}`
        : `${decl.styleKey}CondTruthy${propSuffix}`;
      const rawAltKey = conditionName
        ? `${decl.styleKey}Default`
        : `${decl.styleKey}CondFalsy${propSuffix}`;
      const consKey = ensureUniqueKey(resolvedStyleObjects, rawConsKey);
      const altKey = ensureUniqueKey(resolvedStyleObjects, rawAltKey);

      if (consMap.size > 0) {
        resolvedStyleObjects.set(consKey, createStyleFn(consMap));
      }
      if (altMap.size > 0) {
        resolvedStyleObjects.set(altKey, createStyleFn(altMap));
      }

      // Create function call expressions with props object: { size, padding }
      // Use props.X only when the prop is referenced in the condition (to preserve type narrowing)
      // Use shorthand when the prop is not referenced in the condition
      const conditionIdentifiers = new Set<string>();
      collectIdentifiers(conditional.test, conditionIdentifiers);

      const makeStyleCall = (key: string) => {
        const callArgProperties = valuePropParams.map((p) => {
          const propName = p.startsWith("$") ? p.slice(1) : p;
          // Only use props.X when the prop is referenced in the condition (for type narrowing)
          // Otherwise use shorthand for cleaner output
          const propIsInCondition = conditionIdentifiers.has(p);
          if (propIsInCondition) {
            const propAccess = j.memberExpression(j.identifier("props"), j.identifier(p));
            return j.property.from({
              kind: "init",
              key: j.identifier(propName),
              value: propAccess,
              shorthand: false,
            });
          }
          return j.property.from({
            kind: "init",
            key: j.identifier(propName),
            value: j.identifier(p),
            shorthand: propName === p,
          });
        });
        return j.callExpression(j.memberExpression(j.identifier("styles"), j.identifier(key)), [
          j.objectExpression(callArgProperties),
        ]);
      };

      // Create conditional expression for stylex.props
      const condExpr = j.conditionalExpression(
        cloneAstNode(conditional.test) as ExpressionKind,
        consMap.size > 0 ? makeStyleCall(consKey) : (j.identifier("undefined") as ExpressionKind),
        altMap.size > 0 ? makeStyleCall(altKey) : (j.identifier("undefined") as ExpressionKind),
      );

      // Add to extraStylexPropsArgs
      if (!decl.extraStylexPropsArgs) {
        decl.extraStylexPropsArgs = [];
      }
      decl.extraStylexPropsArgs.push({ expr: condExpr });

      decl.needsWrapperComponent = true;
      for (const propName of propsUsed) {
        ensureShouldForwardPropDrop(decl, propName);
      }
      return true;
    }

    // Check for CallExpression branches (e.g., truncate() helpers)
    const consIsCall = isCallExpressionNode(cons);
    const altIsCall = isCallExpressionNode(alt);

    // Note: String literal branches (StringLiteral CSS values) are NOT handled here.
    // They fall through to tryResolveConditionalCssBlockTernary in builtin-handlers.ts.
    if (!(consIsCss || altIsCss || consIsTpl || altIsTpl || consIsCall || altIsCall)) {
      return false;
    }

    const resolveCssBranch = (
      node: any,
    ): {
      style: Record<string, unknown>;
      dynamicProps: Array<{ jsxProp: string; stylexProp: string }>;
      conditionalVariants: ConditionalVariant[];
    } | null => {
      if (!isCssHelperTaggedTemplate(node)) {
        return null;
      }
      const tplNode = node as { quasi: ExpressionKind };
      return resolveCssHelperTemplate(tplNode.quasi, paramName, decl.loc);
    };

    // Helper to apply conditional variants from a resolved branch
    const applyConditionalVariants = (
      conditionalVariants: ConditionalVariant[],
      outerCondition: string,
    ): void => {
      for (const cv of conditionalVariants) {
        const composedWhen = `${outerCondition} && ${cv.when}`;
        applyVariant({ when: composedWhen, propName: cv.propName }, cv.style);
        ensureShouldForwardPropDrop(decl, cv.propName);
      }
    };

    if (consIsCss && altIsCss) {
      const consResolved = resolveCssBranch(cons);
      const altResolved = resolveCssBranch(alt);
      if (!consResolved || !altResolved) {
        markBail();
        return true;
      }
      if (consResolved.dynamicProps.length > 0 || altResolved.dynamicProps.length > 0) {
        return false;
      }
      mergeStyleObjects(styleObj, altResolved.style);
      applyVariant(testInfo, consResolved.style);
      // Apply conditional variants from both branches
      applyConditionalVariants(consResolved.conditionalVariants, testInfo.when);
      const invertedWhen = invertWhen(testInfo.when);
      if (invertedWhen && altResolved.conditionalVariants.length > 0) {
        applyConditionalVariants(altResolved.conditionalVariants, invertedWhen);
      }
      return true;
    }

    if (consIsCss && altIsEmpty) {
      const consResolved = resolveCssBranch(cons);
      if (!consResolved) {
        markBail();
        return true;
      }
      if (consResolved.dynamicProps.length > 0) {
        return false;
      }
      applyVariant(testInfo, consResolved.style);
      applyConditionalVariants(consResolved.conditionalVariants, testInfo.when);
      return true;
    }

    if (consIsEmpty && altIsCss) {
      const altResolved = resolveCssBranch(alt);
      if (!altResolved) {
        markBail();
        return true;
      }
      if (altResolved.dynamicProps.length > 0) {
        return false;
      }
      const invertedWhen = invertWhen(testInfo.when);
      if (!invertedWhen) {
        return false;
      }
      applyVariant({ ...testInfo, when: invertedWhen }, altResolved.style);
      applyConditionalVariants(altResolved.conditionalVariants, invertedWhen);
      return true;
    }

    // Check altIsEmpty BEFORE altIsTpl since empty templates are also template literals
    // and the altIsEmpty case doesn't require invertWhen (which fails for compound conditions)
    if (consIsTpl && altIsEmpty) {
      dropAllTestInfoProps(testInfo);
      const consResolved = resolveTemplateLiteralBranch(tplCtx, {
        node: cons as any,
        paramName,
      });
      if (!consResolved) {
        return false;
      }
      if (Object.keys(consResolved.style).length > 0) {
        applyVariant(testInfo, consResolved.style);
      }
      if (consResolved.dynamicEntries.length > 0) {
        applyDynamicEntries(consResolved.dynamicEntries, testInfo.when);
      }
      if (consResolved.inlineEntries.length > 0) {
        applyInlineEntries(consResolved.inlineEntries, testInfo.when);
      }
      return true;
    }

    if (consIsTpl && altIsTpl) {
      dropAllTestInfoProps(testInfo);
      const consResolved = resolveTemplateLiteralBranch(tplCtx, {
        node: cons as any,
        paramName,
      });
      const altResolved = resolveTemplateLiteralBranch(tplCtx, {
        node: alt as any,
        paramName,
      });
      if (!consResolved || !altResolved) {
        return false;
      }
      const invertedWhen = invertWhen(testInfo.when);
      if (!invertedWhen) {
        return false;
      }
      if (Object.keys(consResolved.style).length > 0) {
        applyVariant(testInfo, consResolved.style);
      }
      if (Object.keys(altResolved.style).length > 0) {
        applyVariant({ ...testInfo, when: invertedWhen }, altResolved.style);
      }
      if (consResolved.dynamicEntries.length > 0) {
        applyDynamicEntries(consResolved.dynamicEntries, testInfo.when);
      }
      if (altResolved.dynamicEntries.length > 0) {
        applyDynamicEntries(altResolved.dynamicEntries, invertedWhen);
      }
      if (consResolved.inlineEntries.length > 0) {
        applyInlineEntries(consResolved.inlineEntries, testInfo.when);
      }
      if (altResolved.inlineEntries.length > 0) {
        applyInlineEntries(altResolved.inlineEntries, invertedWhen);
      }
      return true;
    }

    if (consIsEmpty && altIsTpl) {
      dropAllTestInfoProps(testInfo);
      const altResolved = resolveTemplateLiteralBranch(tplCtx, {
        node: alt as any,
        paramName,
      });
      if (!altResolved) {
        return false;
      }
      const invertedWhen = invertWhen(testInfo.when);
      if (!invertedWhen) {
        return false;
      }
      if (Object.keys(altResolved.style).length > 0) {
        applyVariant({ ...testInfo, when: invertedWhen }, altResolved.style);
      }
      if (altResolved.dynamicEntries.length > 0) {
        applyDynamicEntries(altResolved.dynamicEntries, invertedWhen);
      }
      if (altResolved.inlineEntries.length > 0) {
        applyInlineEntries(altResolved.inlineEntries, invertedWhen);
      }
      return true;
    }

    // Note: String literal CSS branches (consIsStr && altIsEmpty, consIsEmpty && altIsStr,
    // and consIsStr && altIsStr) are NOT handled here - they fall through to
    // tryResolveConditionalCssBlockTernary in builtin-handlers.ts, which handles them
    // correctly with proper component type generation.

    // Handle CallExpression branches: props.$x ? truncate() : ""
    // These are helpers that return StyleX style objects (usage: "props")
    const tryResolveCallExpressionBranch = (
      callNode: ExpressionKind,
    ): { expr: string; imports: ImportSpec[] } | null => {
      const dynamicNode = {
        slotId: 0,
        expr: callNode,
        css: { kind: "declaration" as const, selector: "&", atRuleStack: [] as string[] },
        component: componentInfo,
        usage: { jsxUsages: 1, hasPropsSpread: false },
      };
      const res = resolveDynamicNode(dynamicNode, handlerContext);
      if (res && res.type === "resolvedStyles") {
        return { expr: res.expr, imports: res.imports ?? [] };
      }
      return null;
    };

    // Handle CallExpression in either branch with empty in the other
    if ((consIsCall && altIsEmpty) || (consIsEmpty && altIsCall)) {
      const callBranch = consIsCall ? cons : alt;
      const resolved = tryResolveCallExpressionBranch(callBranch);
      if (!resolved) {
        return false;
      }

      // Determine the when condition: original for truthy branch, inverted for falsy branch
      let when: string;
      if (consIsCall) {
        when = testInfo.when;
      } else {
        const invertedWhen = invertWhen(testInfo.when);
        if (!invertedWhen) {
          return false;
        }
        when = invertedWhen;
      }

      dropAllTestInfoProps(testInfo);
      for (const imp of resolved.imports) {
        resolverImports.set(JSON.stringify(imp), imp);
      }
      const exprAst = parseExpr(resolved.expr);
      if (!exprAst) {
        return false;
      }
      decl.extraStylexPropsArgs ??= [];
      decl.extraStylexPropsArgs.push({ when, expr: exprAst });
      decl.needsWrapperComponent = true;
      return true;
    }

    return false;
  };
}

// ---------------------------------------------------------------------------
// Block-level theme conditional handler
// ---------------------------------------------------------------------------

/**
 * Rewrites `props.theme.X` → `theme.X` in a cloned AST node.
 * Used to transform condition expressions for the useTheme() wrapper pattern.
 */
function rewriteThemeToUseThemeVar(node: ExpressionKind): ExpressionKind {
  const rewrite = (n: unknown): unknown => {
    if (!n || typeof n !== "object") {
      return n;
    }
    if (Array.isArray(n)) {
      return n.map((child) => rewrite(child));
    }
    const rec = n as ASTNodeRecord;
    // Match MemberExpression(MemberExpression(Identifier("props"), "theme"), <rest>)
    // and replace with MemberExpression(Identifier("theme"), <rest>)
    if (rec.type === "MemberExpression" || rec.type === "OptionalMemberExpression") {
      const obj = rec.object as ASTNodeRecord | undefined;
      if (
        obj &&
        (obj.type === "MemberExpression" || obj.type === "OptionalMemberExpression") &&
        (obj.object as { type?: string; name?: string })?.type === "Identifier" &&
        (obj.object as { name?: string })?.name === "props" &&
        (obj.property as { type?: string; name?: string })?.type === "Identifier" &&
        (obj.property as { name?: string })?.name === "theme" &&
        obj.computed === false
      ) {
        rec.object = { type: "Identifier", name: "theme" } as unknown as ASTNodeRecord;
        rec.property = rewrite(rec.property) as ASTNodeRecord;
        return rec;
      }
      rec.object = rewrite(rec.object) as ASTNodeRecord;
      rec.property = rewrite(rec.property) as ASTNodeRecord;
      return rec;
    }
    if (rec.type === "BinaryExpression" || rec.type === "LogicalExpression") {
      rec.left = rewrite(rec.left) as ASTNodeRecord;
      rec.right = rewrite(rec.right) as ASTNodeRecord;
      return rec;
    }
    if (rec.type === "UnaryExpression") {
      rec.argument = rewrite(rec.argument) as ASTNodeRecord;
      return rec;
    }
    return rec;
  };
  return rewrite(node) as ExpressionKind;
}

/**
 * Extracts theme property info from a condition expression for style key naming.
 *
 * Returns the primary theme property name and optional comparison value:
 * - `theme.isDark` → { themeProp: "isDark" }
 * - `theme.mode === "dark"` → { themeProp: "mode", comparisonValue: "dark" }
 * - `theme.isDark && props.enabled` → { themeProp: "isDark" }
 */
function extractThemeConditionInfo(
  node: ExpressionKind,
): { themeProp: string; comparisonValue?: string } | null {
  const rec = node as ASTNodeRecord;

  if (rec.type === "BinaryExpression") {
    const left = rec.left as ExpressionKind;
    const right = rec.right as ASTNodeRecord;
    const leftInfo = extractThemeConditionInfo(left);
    if (leftInfo && !leftInfo.comparisonValue) {
      const val = literalToStaticValue(right as unknown);
      if (val !== null && typeof val === "string") {
        return { themeProp: leftInfo.themeProp, comparisonValue: val };
      }
    }
    return leftInfo ?? extractThemeConditionInfo(right as ExpressionKind);
  }

  if (rec.type === "MemberExpression" || rec.type === "OptionalMemberExpression") {
    const obj = rec.object as { type?: string; name?: string } | undefined;
    const prop = rec.property as { type?: string; name?: string } | undefined;
    if (obj?.type === "Identifier" && obj.name === "theme" && prop?.type === "Identifier") {
      return prop.name ? { themeProp: prop.name } : null;
    }
    return extractThemeConditionInfo(rec.object as ExpressionKind);
  }

  if (rec.type === "LogicalExpression") {
    return (
      extractThemeConditionInfo(rec.left as ExpressionKind) ??
      extractThemeConditionInfo(rec.right as ExpressionKind)
    );
  }
  if (rec.type === "UnaryExpression") {
    return extractThemeConditionInfo(rec.argument as ExpressionKind);
  }
  return null;
}

type BlockThemeConditionalArgs = Pick<
  CssHelperConditionalContext,
  | "decl"
  | "extraStyleObjects"
  | "j"
  | "filePath"
  | "parseExpr"
  | "resolveValue"
  | "resolveCall"
  | "resolveImportInScope"
  | "resolverImports"
  | "handlerContext"
  | "isCssHelperTaggedTemplate"
  | "isPlainTemplateLiteral"
  | "resolveStaticCssBlock"
> & {
  conditional: { test: ExpressionKind; consequent: ExpressionKind; alternate: ExpressionKind };
  paramName: string | null;
  replaceParamWithProps: (exprNode: ExpressionKind) => ExpressionKind;
  isEmptyCssBranch: (node: ExpressionKind) => boolean;
  componentInfo: { localName: string; base: string; tagOrIdent: string };
};

/**
 * Attempts to resolve a block-level theme conditional (where `isThemeAccessTest` is true)
 * by resolving both CSS branches and emitting theme-conditional style objects.
 *
 * Returns true if successfully handled, false if should fall through to bail.
 */
function tryResolveBlockLevelThemeConditional(args: BlockThemeConditionalArgs): boolean {
  const {
    conditional,
    paramName,
    replaceParamWithProps,
    isEmptyCssBranch,
    isPlainTemplateLiteral,
    isCssHelperTaggedTemplate,
    resolveStaticCssBlock,
    decl,
    extraStyleObjects,
    j,
    filePath,
    parseExpr,
    resolveValue,
    resolveCall,
    resolveImportInScope,
    resolverImports,
    componentInfo,
    handlerContext,
  } = args;

  const cons = conditional.consequent;
  const alt = conditional.alternate;
  const consIsEmpty = isEmptyCssBranch(cons);
  const altIsEmpty = isEmptyCssBranch(alt);

  const tplCtx: TemplateLiteralContext = {
    j,
    filePath,
    parseExpr,
    resolveValue,
    resolveCall,
    resolveImportInScope,
    resolverImports,
    componentInfo: componentInfo as TemplateLiteralContext["componentInfo"],
    handlerContext,
  };

  const resolveTemplateNode = (
    tplNode: import("jscodeshift").TemplateLiteral,
  ): Record<string, unknown> | null => {
    const resolved = resolveTemplateLiteralBranch(tplCtx, {
      node: tplNode,
      paramName,
    });
    if (!resolved) {
      return null;
    }
    // Block-level theme conditionals cannot handle dynamic/inline entries
    if (resolved.dynamicEntries.length > 0 || resolved.inlineEntries.length > 0) {
      return null;
    }
    return resolved.style;
  };

  const resolveBranch = (node: ExpressionKind): Record<string, unknown> | null => {
    // String literal: "color: white;"
    if (
      node.type === "StringLiteral" ||
      (node.type === "Literal" && typeof (node as { value?: unknown }).value === "string")
    ) {
      const rawCss = (node as { value: string }).value;
      return resolveStaticCssBlock(rawCss);
    }
    // Template literal (with or without interpolations)
    if (isPlainTemplateLiteral(node)) {
      return resolveTemplateNode(node as import("jscodeshift").TemplateLiteral);
    }
    // css`` tagged template
    if (isCssHelperTaggedTemplate(node)) {
      return resolveTemplateNode((node as { quasi: import("jscodeshift").TemplateLiteral }).quasi);
    }
    return null;
  };

  const consStyle = consIsEmpty ? {} : resolveBranch(cons);
  const altStyle = altIsEmpty ? {} : resolveBranch(alt);

  if (consStyle === null || altStyle === null) {
    return false;
  }

  if (Object.keys(consStyle).length === 0 && Object.keys(altStyle).length === 0) {
    return false;
  }

  // Build condition expression:
  // 1. replaceParamWithProps: rewrites param refs (handles destructured ({ theme }) patterns)
  // 2. rewriteThemeToUseThemeVar: replaces `props.theme.X` → `theme.X`
  const propsCondition = replaceParamWithProps(conditional.test);
  const conditionExpr = rewriteThemeToUseThemeVar(propsCondition);

  const themeInfo = extractThemeConditionInfo(conditionExpr);
  if (!themeInfo) {
    return false;
  }
  const { themeProp } = themeInfo;

  const { trueKey, falseKey } = buildThemeStyleKeys(
    decl.styleKey,
    themeProp,
    themeInfo.comparisonValue,
  );
  const hasTrue = Object.keys(consStyle).length > 0;
  const hasFalse = Object.keys(altStyle).length > 0;
  const trueStyleKey = hasTrue ? trueKey : null;
  const falseStyleKey = hasFalse ? falseKey : null;

  if (trueStyleKey) {
    extraStyleObjects.set(trueStyleKey, consStyle);
  }
  if (falseStyleKey) {
    extraStyleObjects.set(falseStyleKey, altStyle);
  }

  if (!decl.needsUseThemeHook) {
    decl.needsUseThemeHook = [];
  }
  decl.needsUseThemeHook.push({
    themeProp,
    conditionExpr,
    trueStyleKey,
    falseStyleKey,
  });

  decl.needsWrapperComponent = true;
  return true;
}

/** Returns a unique key by appending a numeric suffix if the key already exists in the map. */
function ensureUniqueKey(map: Map<string, unknown>, key: string): string {
  if (!map.has(key)) {
    return key;
  }
  let i = 2;
  while (map.has(`${key}${i}`)) {
    i++;
  }
  return `${key}${i}`;
}

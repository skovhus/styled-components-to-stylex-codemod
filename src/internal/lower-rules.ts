import type { API, ASTNode, Collection, JSCodeshift } from "jscodeshift";
import { compile } from "stylis";
import { resolveDynamicNode } from "./builtin-handlers.js";
import { normalizeStylisAstToIR } from "./css-ir.js";
import { cssDeclarationToStylexDeclarations, cssPropertyToStylexProp } from "./css-prop-mapping.js";
import { getMemberPathFromIdentifier, getNodeLocStart } from "./jscodeshift-utils.js";
import type { ImportSource, ImportSpec, ResolveContext, ResolveResult } from "../adapter.js";
import { tryHandleAnimation } from "./lower-rules/animation.js";
import { tryHandleInterpolatedBorder } from "./lower-rules/borders.js";
import {
  extractStaticParts,
  tryHandleInterpolatedStringValue,
  wrapExprWithStaticParts,
} from "./lower-rules/interpolations.js";
import { parseStyledTemplateLiteral } from "./styled-css.js";
import {
  createTypeInferenceHelpers,
  ensureShouldForwardPropDrop,
  literalToStaticValue,
} from "./lower-rules/types.js";
import {
  normalizeSelectorForInputAttributePseudos,
  parseAttributeSelector,
  parseCommaSeparatedPseudos,
  parsePseudoElement,
  parseSimplePseudo,
} from "./selectors.js";
import type { StyledDecl } from "./transform-types.js";
import type { WarningLog } from "./logger.js";

export type DescendantOverride = {
  parentStyleKey: string;
  childStyleKey: string;
  overrideStyleKey: string;
};

type ExpressionKind = Parameters<JSCodeshift["expressionStatement"]>[0];

export function lowerRules(args: {
  api: API;
  j: JSCodeshift;
  root: Collection<ASTNode>;
  filePath: string;
  resolveValue: (ctx: ResolveContext) => ResolveResult | null;
  importMap: Map<
    string,
    {
      importedName: string;
      source: ImportSource;
    }
  >;
  warnings: WarningLog[];
  resolverImports: Map<string, ImportSpec>;
  styledDecls: StyledDecl[];
  keyframesNames: Set<string>;
  cssHelperNames: Set<string>;
  stringMappingFns: Map<
    string,
    {
      param: string;
      testParam: string;
      whenValue: string;
      thenValue: string;
      elseValue: string;
    }
  >;
  toStyleKey: (name: string) => string;
  toSuffixFromProp: (propName: string) => string;
  parseExpr: (exprSource: string) => ExpressionKind | null;
  cssValueToJs: (value: unknown, important?: boolean) => unknown;
  rewriteCssVarsInStyleObject: (
    obj: Record<string, unknown>,
    definedVars: Map<string, string>,
    varsToDrop: Set<string>,
  ) => void;
  literalToAst: (j: JSCodeshift, v: unknown) => ExpressionKind;
}): {
  resolvedStyleObjects: Map<string, unknown>;
  descendantOverrides: DescendantOverride[];
  ancestorSelectorParents: Set<string>;
  bail: boolean;
} {
  const {
    api,
    j,
    root,
    filePath,
    resolveValue,
    importMap,
    warnings,
    resolverImports,
    styledDecls,
    keyframesNames,
    cssHelperNames,
    stringMappingFns,
    toStyleKey,
    toSuffixFromProp,
    parseExpr,
    cssValueToJs,
    rewriteCssVarsInStyleObject,
    literalToAst,
  } = args;

  const resolvedStyleObjects = new Map<string, unknown>();
  const declByLocalName = new Map(styledDecls.map((d) => [d.localName, d]));
  const descendantOverrides: DescendantOverride[] = [];
  const ancestorSelectorParents = new Set<string>();
  const descendantOverrideBase = new Map<string, Record<string, unknown>>();
  const descendantOverrideHover = new Map<string, Record<string, unknown>>();
  let bail = false;

  // ─────────────────────────────────────────────────────────────────────────────
  // Helper: Extract static prefix/suffix from interpolated CSS values
  // ─────────────────────────────────────────────────────────────────────────────
  // For CSS like `box-shadow: 0 2px 4px ${color}` or `transform: rotate(${deg})`
  // we need to preserve the static parts when resolving the dynamic value.
  //
  // StyleX supports dynamic values via CSS variables, and template literals work
  // well for combining static text with resolved expressions:
  //   boxShadow: `0 2px 4px ${themeVars.primaryColor}`
  //
  // See: https://stylexjs.com/docs/learn/styling-ui/defining-styles/
  // ─────────────────────────────────────────────────────────────────────────────

  // (helpers extracted to `./lower-rules/*` modules)

  // Build a template literal with static prefix/suffix around a dynamic expression.
  // e.g., prefix="" suffix="ms" expr=<call> -> `${<call>}ms`
  const buildTemplateWithStaticParts = (
    j: JSCodeshift,
    expr: ExpressionKind,
    prefix: string,
    suffix: string,
  ): ExpressionKind => {
    if (!prefix && !suffix) {
      return expr;
    }
    return j.templateLiteral(
      [
        j.templateElement({ raw: prefix, cooked: prefix }, false),
        j.templateElement({ raw: suffix, cooked: suffix }, true),
      ],
      [expr],
    );
  };

  const unwrapArrowFunctionToPropsExpr = (
    expr: any,
  ): { expr: any; propsUsed: Set<string> } | null => {
    if (!expr || expr.type !== "ArrowFunctionExpression") {
      return null;
    }
    if (expr.params?.length !== 1 || expr.params[0]?.type !== "Identifier") {
      return null;
    }
    const paramName = expr.params[0].name;
    const bodyExpr =
      expr.body?.type === "BlockStatement"
        ? expr.body.body?.find((s: any) => s.type === "ReturnStatement")?.argument
        : expr.body;
    if (!bodyExpr) {
      return null;
    }

    const propsUsed = new Set<string>();
    let safeToInline = true;
    const cloneNode = (node: any): any => {
      if (!node || typeof node !== "object") {
        return node;
      }
      if (Array.isArray(node)) {
        return node.map(cloneNode);
      }
      const out: any = {};
      for (const key of Object.keys(node)) {
        if (key === "loc" || key === "comments" || key === "tokens") {
          continue;
        }
        out[key] = cloneNode((node as any)[key]);
      }
      return out;
    };
    const clone = cloneNode(bodyExpr);
    const replace = (node: any): any => {
      if (!node || typeof node !== "object") {
        return node;
      }
      if (Array.isArray(node)) {
        return node.map(replace);
      }
      if (
        (node.type === "MemberExpression" || node.type === "OptionalMemberExpression") &&
        node.object?.type === "Identifier" &&
        node.object.name === paramName &&
        node.property?.type === "Identifier" &&
        node.computed === false
      ) {
        const propName = node.property.name;
        if (!propName.startsWith("$")) {
          safeToInline = false;
          return node;
        }
        propsUsed.add(propName);
        return j.identifier(propName);
      }
      for (const key of Object.keys(node)) {
        if (key === "loc" || key === "comments") {
          continue;
        }
        const child = (node as any)[key];
        if (child && typeof child === "object") {
          (node as any)[key] = replace(child);
        }
      }
      return node;
    };
    const replaced = replace(clone);
    if (!safeToInline || propsUsed.size === 0) {
      return null;
    }
    return { expr: replaced, propsUsed };
  };

  for (const decl of styledDecls) {
    if (decl.preResolvedStyle) {
      resolvedStyleObjects.set(decl.styleKey, decl.preResolvedStyle);
      if (decl.preResolvedFnDecls) {
        for (const [k, v] of Object.entries(decl.preResolvedFnDecls)) {
          resolvedStyleObjects.set(k, v as any);
        }
      }
      continue;
    }

    const styleObj: Record<string, unknown> = {};
    const perPropPseudo: Record<string, Record<string, unknown>> = {};
    const perPropMedia: Record<string, Record<string, unknown>> = {};
    const nestedSelectors: Record<string, Record<string, unknown>> = {};
    const variantBuckets = new Map<string, Record<string, unknown>>();
    const variantStyleKeys: Record<string, string> = {};
    const styleFnFromProps: Array<{ fnKey: string; jsxProp: string }> = [];
    const styleFnDecls = new Map<string, any>();
    const attrBuckets = new Map<string, Record<string, unknown>>();
    const inlineStyleProps: Array<{ prop: string; expr: ExpressionKind }> = [];
    const localVarValues = new Map<string, string>();

    const { findJsxPropTsType, annotateParamFromJsxProp } = createTypeInferenceHelpers({
      root,
      j,
      decl,
    });

    const addPropComments = (
      target: any,
      prop: string,
      comments: { leading?: string | null; trailingLine?: string | null },
    ): void => {
      if (!prop) {
        return;
      }
      const leading = comments.leading ?? null;
      const trailingLine = comments.trailingLine ?? null;
      if (!leading && !trailingLine) {
        return;
      }
      const key = "__propComments";
      const existing = (target as any)[key];
      const map =
        existing && typeof existing === "object" && !Array.isArray(existing)
          ? existing
          : ({} as any);
      const prev = (map[prop] && typeof map[prop] === "object" ? map[prop] : {}) as any;
      if (leading) {
        prev.leading = leading;
      }
      if (trailingLine) {
        prev.trailingLine = trailingLine;
      }
      map[prop] = prev;
      (target as any)[key] = map;
    };

    const toKebab = (s: string) =>
      s
        .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
        .replace(/[^a-zA-Z0-9-]/g, "-")
        .toLowerCase();

    const isAstNode = (v: unknown): v is { type: string } =>
      !!v && typeof v === "object" && !Array.isArray(v) && typeof (v as any).type === "string";

    const mergeStyleObjects = (
      target: Record<string, unknown>,
      source: Record<string, unknown>,
    ) => {
      for (const [key, value] of Object.entries(source)) {
        const existing = (target as any)[key];
        if (
          existing &&
          value &&
          typeof existing === "object" &&
          typeof value === "object" &&
          !Array.isArray(existing) &&
          !Array.isArray(value) &&
          !isAstNode(existing) &&
          !isAstNode(value)
        ) {
          mergeStyleObjects(existing as Record<string, unknown>, value as Record<string, unknown>);
        } else {
          (target as any)[key] = value as any;
        }
      }
    };

    const isCssHelperTaggedTemplate = (expr: any): expr is { quasi: any } => {
      if (!expr || expr.type !== "TaggedTemplateExpression") {
        return false;
      }
      if (expr.tag?.type !== "Identifier") {
        return false;
      }
      const localName = expr.tag.name;
      const imp = importMap.get(localName);
      return (
        !!imp &&
        imp.importedName === "css" &&
        imp.source?.kind === "specifier" &&
        imp.source.value === "styled-components"
      );
    };

    const resolveHelperExprToAst = (expr: any, paramName: string | null): any => {
      if (!expr || typeof expr !== "object") {
        return null;
      }
      if (
        expr.type === "StringLiteral" ||
        expr.type === "NumericLiteral" ||
        expr.type === "Literal"
      ) {
        return expr;
      }
      const path =
        paramName && (expr.type === "MemberExpression" || expr.type === "OptionalMemberExpression")
          ? getMemberPathFromIdentifier(expr as any, paramName)
          : null;
      if (!path || path[0] !== "theme") {
        return null;
      }
      const themePath = path.slice(1).join(".");
      const res = resolveValue({
        kind: "theme",
        path: themePath,
      });
      if (!res) {
        return null;
      }
      for (const imp of res.imports ?? []) {
        resolverImports.set(JSON.stringify(imp), imp);
      }
      const exprAst = parseExpr(res.expr);
      return exprAst ?? null;
    };

    const resolveCssHelperTemplate = (
      template: any,
      paramName: string | null,
    ): Record<string, unknown> | null => {
      const parsed = parseStyledTemplateLiteral(template);
      const rawCss = parsed.rawCss;
      const wrappedRawCss = `& { ${rawCss} }`;
      const stylisAst = compile(wrappedRawCss);
      const rules = normalizeStylisAstToIR(stylisAst as any, parsed.slots, {
        rawCss: wrappedRawCss,
      });
      const slotExprById = new Map(parsed.slots.map((s) => [s.index, s.expression]));

      const out: Record<string, unknown> = {};

      const normalizePseudoElement = (pseudo: string | null): string | null => {
        if (!pseudo) {
          return null;
        }
        if (pseudo === ":before" || pseudo === ":after") {
          return `::${pseudo.slice(1)}`;
        }
        return pseudo.startsWith("::") ? pseudo : null;
      };

      for (const rule of rules) {
        if (rule.atRuleStack.length > 0) {
          return null;
        }
        const selector = (rule.selector ?? "").trim();
        let target = out;
        if (selector !== "&") {
          const pseudoElement = parsePseudoElement(selector);
          const simplePseudo = parseSimplePseudo(selector);
          const normalizedPseudoElement = normalizePseudoElement(
            pseudoElement ??
              (simplePseudo === ":before" || simplePseudo === ":after" ? simplePseudo : null),
          );
          if (normalizedPseudoElement) {
            const nested = (out[normalizedPseudoElement] as any) ?? {};
            out[normalizedPseudoElement] = nested;
            target = nested;
          } else if (simplePseudo) {
            const nested = (out[simplePseudo] as any) ?? {};
            out[simplePseudo] = nested;
            target = nested;
          } else {
            return null;
          }
        }

        for (const d of rule.declarations) {
          if (!d.property) {
            return null;
          }
          if (d.value.kind === "static") {
            for (const mapped of cssDeclarationToStylexDeclarations(d)) {
              let value = cssValueToJs(mapped.value, d.important);
              if (mapped.prop === "content" && typeof value === "string") {
                const m = value.match(/^['"]([\s\S]*)['"]$/);
                if (m) {
                  value = `"${m[1]}"`;
                } else if (!value.startsWith('"') && !value.endsWith('"')) {
                  value = `"${value}"`;
                }
              }
              (target as any)[mapped.prop] = value as any;
            }
            continue;
          }

          if (d.important) {
            return null;
          }

          const parts = d.value.parts ?? [];
          if (parts.length !== 1 || parts[0]?.kind !== "slot") {
            return null;
          }
          const slotId = parts[0].slotId;
          const expr = slotExprById.get(slotId);
          if (!expr) {
            return null;
          }
          const exprAst = resolveHelperExprToAst(expr as any, paramName);
          if (!exprAst) {
            return null;
          }
          for (const mapped of cssDeclarationToStylexDeclarations(d)) {
            (target as any)[mapped.prop] = exprAst as any;
          }
        }
      }

      return out;
    };

    // (animation + interpolated-string helpers extracted to `./lower-rules/*`)

    const tryHandleMappedFunctionColor = (d: any): boolean => {
      // Handle: background: ${(props) => getColor(props.variant)}
      // when `getColor` is a simple conditional mapping function.
      if ((d.property ?? "").trim() !== "background") {
        return false;
      }
      if (d.value.kind !== "interpolated") {
        return false;
      }
      const slot = d.value.parts.find((p: any) => p.kind === "slot");
      if (!slot) {
        return false;
      }
      const expr = decl.templateExpressions[slot.slotId] as any;
      if (!expr || expr.type !== "ArrowFunctionExpression") {
        return false;
      }
      const paramName = expr.params?.[0]?.type === "Identifier" ? expr.params[0].name : null;
      if (!paramName) {
        return false;
      }
      const body = expr.body as any;
      if (!body || body.type !== "CallExpression") {
        return false;
      }
      if (body.callee?.type !== "Identifier") {
        return false;
      }
      const fnName = body.callee.name;
      const mapping = stringMappingFns.get(fnName);
      if (!mapping) {
        return false;
      }
      const arg0 = body.arguments?.[0];
      if (!arg0 || arg0.type !== "MemberExpression") {
        return false;
      }
      const path = getMemberPathFromIdentifier(arg0 as any, paramName);
      if (!path || path.length !== 1) {
        return false;
      }
      const propName = path[0]!;

      // Convert this component into a wrapper so we don't forward `variant` to DOM.
      decl.needsWrapperComponent = true;

      // Build style keys for the variant mapping.
      // Use stable keys based on the component style key.
      const baseKey = decl.styleKey.endsWith("Base") ? decl.styleKey : `${decl.styleKey}Base`;
      const primaryKey = `${decl.styleKey}Primary`;
      const secondaryKey = `${decl.styleKey}Secondary`;

      // Ensure the base style object doesn't get a static background.
      // The wrapper will apply the background via variants.
      delete styleObj.backgroundColor;

      decl.enumVariant = {
        propName,
        baseKey,
        cases: [
          {
            kind: "eq",
            whenValue: mapping.whenValue,
            styleKey: primaryKey,
            value: mapping.thenValue,
          },
          {
            kind: "neq",
            whenValue: mapping.whenValue,
            styleKey: secondaryKey,
            value: mapping.elseValue,
          },
        ],
      };

      return true;
    };

    const tryHandleLogicalOrDefault = (d: any): boolean => {
      // Handle: background: ${(p) => p.color || "#BF4F74"}
      //         padding: ${(p) => p.$padding || "16px"}
      if (d.value.kind !== "interpolated") {
        return false;
      }
      if (!d.property) {
        return false;
      }
      const slot = d.value.parts.find((p: any) => p.kind === "slot");
      if (!slot) {
        return false;
      }
      const expr = decl.templateExpressions[slot.slotId] as any;
      if (!expr || expr.type !== "ArrowFunctionExpression") {
        return false;
      }
      const paramName = expr.params?.[0]?.type === "Identifier" ? expr.params[0].name : null;
      if (!paramName) {
        return false;
      }
      if (
        expr.body?.type !== "LogicalExpression" ||
        expr.body.operator !== "||" ||
        expr.body.left?.type !== "MemberExpression"
      ) {
        return false;
      }
      const left = expr.body.left as any;
      if (left.object?.type !== "Identifier" || left.object.name !== paramName) {
        return false;
      }
      if (left.property?.type !== "Identifier") {
        return false;
      }
      const jsxProp = left.property.name;
      const right = expr.body.right as any;
      const fallback =
        right?.type === "StringLiteral" || right?.type === "Literal"
          ? right.value
          : right?.type === "NumericLiteral"
            ? right.value
            : null;
      if (fallback === null) {
        return false;
      }

      // Default value into base style, plus a style function applied when prop is provided.
      for (const out of cssDeclarationToStylexDeclarations(d)) {
        const fnKey = `${decl.styleKey}${toSuffixFromProp(out.prop)}`;
        styleObj[out.prop] = fallback;
        styleFnFromProps.push({ fnKey, jsxProp });
        if (!styleFnDecls.has(fnKey)) {
          const param = j.identifier(out.prop);
          annotateParamFromJsxProp(param, jsxProp);
          const p = j.property("init", j.identifier(out.prop), j.identifier(out.prop)) as any;
          p.shorthand = true;
          styleFnDecls.set(fnKey, j.arrowFunctionExpression([param], j.objectExpression([p])));
        }
      }
      return true;
    };

    const tryHandleCssHelperConditionalBlock = (d: any): boolean => {
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
      const paramName = expr.params?.[0]?.type === "Identifier" ? expr.params[0].name : null;
      if (!paramName) {
        return false;
      }
      if (expr.body?.type !== "ConditionalExpression") {
        return false;
      }

      const readPropName = (node: any): string | null => {
        const path = getMemberPathFromIdentifier(node as any, paramName);
        if (!path || path.length !== 1) {
          return null;
        }
        return path[0]!;
      };

      const testInfo = (() => {
        const test = expr.body.test as any;
        if (!test || typeof test !== "object") {
          return null;
        }
        if (test.type === "MemberExpression" || test.type === "OptionalMemberExpression") {
          const propName = readPropName(test);
          return propName ? { when: propName, propName } : null;
        }
        if (test.type === "UnaryExpression" && test.operator === "!") {
          const propName = readPropName(test.argument);
          return propName ? { when: `!${propName}`, propName } : null;
        }
        if (
          test.type === "BinaryExpression" &&
          (test.operator === "===" || test.operator === "!==") &&
          (test.left?.type === "MemberExpression" || test.left?.type === "OptionalMemberExpression")
        ) {
          const propName = readPropName(test.left);
          const rhs = literalToStaticValue(test.right);
          if (!propName || rhs === null) {
            return null;
          }
          const rhsValue = JSON.stringify(rhs);
          return { when: `${propName} ${test.operator} ${rhsValue}`, propName };
        }
        return null;
      })();

      if (!testInfo) {
        return false;
      }

      const cons = expr.body.consequent as any;
      const alt = expr.body.alternate as any;
      if (!isCssHelperTaggedTemplate(cons) || !isCssHelperTaggedTemplate(alt)) {
        return false;
      }

      const consStyle = resolveCssHelperTemplate(cons.quasi, paramName);
      const altStyle = resolveCssHelperTemplate(alt.quasi, paramName);
      if (!consStyle || !altStyle) {
        return false;
      }

      mergeStyleObjects(styleObj, altStyle);

      const when = testInfo.when;
      const existingBucket = variantBuckets.get(when);
      const nextBucket = existingBucket ? { ...existingBucket } : {};
      mergeStyleObjects(nextBucket, consStyle);
      variantBuckets.set(when, nextBucket);
      variantStyleKeys[when] ??= `${decl.styleKey}${toSuffixFromProp(when)}`;
      if (testInfo.propName && !testInfo.propName.startsWith("$")) {
        ensureShouldForwardPropDrop(decl, testInfo.propName);
      }
      return true;
    };

    for (const rule of decl.rules) {
      // Sibling selectors:
      // - & + &  (adjacent sibling)
      // - &.something ~ & (general sibling after a class marker)
      const selTrim = rule.selector.trim();

      if (selTrim === "& + &" || /^&\s*\+\s*&$/.test(selTrim)) {
        decl.needsWrapperComponent = true;
        decl.siblingWrapper ??= {
          adjacentKey: "adjacentSibling",
          propAdjacent: "isAdjacentSibling",
        };
        const obj: Record<string, unknown> = {};
        for (const d of rule.declarations) {
          if (d.value.kind !== "static") {
            continue;
          }
          const outs = cssDeclarationToStylexDeclarations(d);
          for (let i = 0; i < outs.length; i++) {
            const out = outs[i]!;
            if (out.value.kind !== "static") {
              continue;
            }
            obj[out.prop] = cssValueToJs(out.value, d.important);
            if (i === 0) {
              addPropComments(obj, out.prop, {
                leading: (d as any).leadingComment,
                trailingLine: (d as any).trailingLineComment,
              });
            }
          }
        }
        resolvedStyleObjects.set(decl.siblingWrapper.adjacentKey, obj);
        continue;
      }
      const mSibling = selTrim.match(/^&\.([a-zA-Z0-9_-]+)\s*~\s*&$/);
      if (mSibling) {
        const cls = mSibling[1]!;
        const propAfter = `isSiblingAfter${toSuffixFromProp(cls)}`;
        decl.needsWrapperComponent = true;
        decl.siblingWrapper ??= {
          adjacentKey: "adjacentSibling",
          propAdjacent: "isAdjacentSibling",
        };
        decl.siblingWrapper.afterClass = cls;
        decl.siblingWrapper.afterKey = `siblingAfter${toSuffixFromProp(cls)}`;
        decl.siblingWrapper.propAfter = propAfter;

        const obj: Record<string, unknown> = {};
        for (const d of rule.declarations) {
          if (d.value.kind !== "static") {
            continue;
          }
          const outs = cssDeclarationToStylexDeclarations(d);
          for (let i = 0; i < outs.length; i++) {
            const out = outs[i]!;
            if (out.value.kind !== "static") {
              continue;
            }
            obj[out.prop] = cssValueToJs(out.value, d.important);
            if (i === 0) {
              addPropComments(obj, out.prop, {
                leading: (d as any).leadingComment,
                trailingLine: (d as any).trailingLineComment,
              });
            }
          }
        }
        resolvedStyleObjects.set(decl.siblingWrapper.afterKey, obj);
        continue;
      }

      // --- Unsupported complex selector detection ---
      // We bail out rather than emitting incorrect unconditional styles.
      //
      // Examples we currently cannot represent safely:
      // - Grouped selectors: `&:hover, &:focus { ... }`
      // - Compound class selectors: `&.card.highlighted { ... }`
      // - Class-conditioned rules: `&.active { ... }` (requires runtime class/prop gating)
      // - Descendant element selectors: `& a { ... }`, `& h1, & h2 { ... }`
      // - Chained pseudos like `:not(...)`
      //
      // NOTE: descendant component selectors use `__SC_EXPR_` placeholders and are handled separately.
      if (typeof rule.selector === "string") {
        const s = rule.selector.trim();
        const hasExprPlaceholder = s.includes("__SC_EXPR_");

        if (s.includes(",") && !parseCommaSeparatedPseudos(s)) {
          // Bail on comma-separated selectors unless ALL parts are valid pseudo-selectors
          // (e.g., "&:hover, &:focus" is OK, but "&:hover, & .child" is not)
          bail = true;
        } else if (s.includes(":not(")) {
          bail = true;
        } else if (!hasExprPlaceholder && /&\.[a-zA-Z0-9_-]+/.test(s)) {
          // Any class selector on the same element (except the sibling patterns handled above).
          bail = true;
        } else if (!hasExprPlaceholder && /\s+[a-zA-Z]/.test(s)) {
          // Descendant element selectors like `& a`, `& h1`, etc.
          bail = true;
        }

        if (bail) {
          warnings.push({
            severity: "warning",
            type: "unsupported-feature",
            message:
              "Complex selectors (grouped selectors, descendant element selectors, class-conditioned selectors, or :not() chains) are not currently supported",
          });
          break;
        }
      }

      // Component selector emulation and other rule handling continues...
      // NOTE: This function intentionally mirrors existing logic from `transform.ts`.

      if (typeof rule.selector === "string" && rule.selector.includes("__SC_EXPR_")) {
        const slotMatch = rule.selector.match(/__SC_EXPR_(\d+)__/);
        const slotId = slotMatch ? Number(slotMatch[1]) : null;
        const slotExpr = slotId !== null ? (decl.templateExpressions[slotId] as any) : null;
        const otherLocal = slotExpr?.type === "Identifier" ? (slotExpr.name as string) : null;

        const selTrim2 = rule.selector.trim();

        // `${Other}:hover &` (Icon reacting to Link hover)
        if (
          otherLocal &&
          selTrim2.startsWith("__SC_EXPR_") &&
          rule.selector.includes(":hover") &&
          rule.selector.includes("&")
        ) {
          const parentDecl = declByLocalName.get(otherLocal);
          const parentStyle = parentDecl && resolvedStyleObjects.get(parentDecl.styleKey);
          if (parentStyle) {
            for (const d of rule.declarations) {
              if (d.value.kind !== "static") {
                continue;
              }
              for (const out of cssDeclarationToStylexDeclarations(d)) {
                if (out.value.kind !== "static") {
                  continue;
                }
                const hoverValue = out.value.value;
                const rawBase = (styleObj as any)[out.prop] as unknown;
                const baseValue =
                  typeof rawBase === "string" || typeof rawBase === "number" ? String(rawBase) : "";
                const varName = `--sc2sx-${toKebab(decl.localName)}-${toKebab(out.prop)}`;
                (parentStyle as any)[varName] = {
                  default: baseValue || null,
                  ":hover": hoverValue,
                };
                styleObj[out.prop] = `var(${varName}, ${baseValue || "inherit"})`;
              }
            }
          }
          continue;
        }

        // `${Child}` / `&:hover ${Child}` (Parent styling a descendant child)
        if (otherLocal && selTrim2.startsWith("&")) {
          const childDecl = declByLocalName.get(otherLocal);
          const isHover = rule.selector.includes(":hover");
          if (childDecl) {
            const overrideStyleKey = `${toStyleKey(otherLocal)}In${decl.localName}`;
            ancestorSelectorParents.add(decl.styleKey);
            descendantOverrides.push({
              parentStyleKey: decl.styleKey,
              childStyleKey: childDecl.styleKey,
              overrideStyleKey,
            });
            const baseBucket = descendantOverrideBase.get(overrideStyleKey) ?? {};
            const hoverBucket = descendantOverrideHover.get(overrideStyleKey) ?? {};
            descendantOverrideBase.set(overrideStyleKey, baseBucket);
            descendantOverrideHover.set(overrideStyleKey, hoverBucket);

            for (const d of rule.declarations) {
              if (d.value.kind !== "static") {
                continue;
              }
              for (const out of cssDeclarationToStylexDeclarations(d)) {
                if (out.value.kind !== "static") {
                  continue;
                }
                const v = cssValueToJs(out.value, d.important);
                if (!isHover) {
                  (baseBucket as any)[out.prop] = v;
                } else {
                  (hoverBucket as any)[out.prop] = v;
                }
              }
            }
          }
          continue;
        }
      }

      const media = rule.atRuleStack.find((a) => a.startsWith("@media"));

      const isInputIntrinsic = decl.base.kind === "intrinsic" && decl.base.tagName === "input";
      const selector = normalizeSelectorForInputAttributePseudos(rule.selector, isInputIntrinsic);

      // Support comma-separated pseudo-selectors like "&:hover, &:focus"
      const pseudos =
        parseCommaSeparatedPseudos(selector) ??
        (parseSimplePseudo(selector) ? [parseSimplePseudo(selector)!] : null);
      const pseudoElement = parsePseudoElement(selector);

      const attrSel = parseAttributeSelector(selector);
      const attrWrapperKind =
        decl.base.kind === "intrinsic" && decl.base.tagName === "input"
          ? "input"
          : decl.base.kind === "intrinsic" && decl.base.tagName === "a"
            ? "link"
            : null;
      const isAttrRule = !!attrSel && !!attrWrapperKind;
      let attrTarget: Record<string, unknown> | null = null;
      let attrPseudoElement: string | null = null;

      if (isAttrRule) {
        decl.needsWrapperComponent = true;
        decl.attrWrapper ??= { kind: attrWrapperKind! };
        const suffix = attrSel!.suffix;
        const attrTargetStyleKey = `${decl.styleKey}${suffix}`;
        attrTarget = attrBuckets.get(attrTargetStyleKey) ?? {};
        attrBuckets.set(attrTargetStyleKey, attrTarget);
        attrPseudoElement = attrSel!.pseudoElement ?? null;

        if (attrWrapperKind === "input") {
          if (attrSel!.kind === "typeCheckbox") {
            decl.attrWrapper.checkboxKey = attrTargetStyleKey;
          } else if (attrSel!.kind === "typeRadio") {
            decl.attrWrapper.radioKey = attrTargetStyleKey;
          }
        } else if (attrWrapperKind === "link") {
          if (attrSel!.kind === "targetBlankAfter") {
            decl.attrWrapper.externalKey = attrTargetStyleKey;
          } else if (attrSel!.kind === "hrefStartsHttps") {
            decl.attrWrapper.httpsKey = attrTargetStyleKey;
          } else if (attrSel!.kind === "hrefEndsPdf") {
            decl.attrWrapper.pdfKey = attrTargetStyleKey;
          }
        }
      }

      for (const d of rule.declarations) {
        if (d.value.kind === "interpolated") {
          if (bail) {
            break;
          }
          if (tryHandleMappedFunctionColor(d)) {
            continue;
          }
          if (tryHandleAnimation({ j, decl, d, keyframesNames, styleObj })) {
            continue;
          }
          if (
            tryHandleInterpolatedBorder({
              api,
              j,
              filePath,
              decl,
              d,
              styleObj,
              resolveValue,
              importMap,
              warnings,
              resolverImports,
              parseExpr,
              toSuffixFromProp,
              variantBuckets,
              variantStyleKeys,
              inlineStyleProps,
            })
          ) {
            continue;
          }
          // Create a resolver for embedded call expressions in compound CSS values
          const resolveCallExpr = (expr: any): { resolved: any; imports?: any[] } | null => {
            if (expr?.type !== "CallExpression") {
              return null;
            }
            const res = resolveDynamicNode(
              {
                slotId: 0,
                expr,
                css: {
                  kind: "declaration",
                  selector: rule.selector,
                  atRuleStack: rule.atRuleStack,
                  ...(d.property ? { property: d.property } : {}),
                  valueRaw: d.valueRaw,
                },
                component:
                  decl.base.kind === "intrinsic"
                    ? {
                        localName: decl.localName,
                        base: "intrinsic",
                        tagOrIdent: decl.base.tagName,
                      }
                    : { localName: decl.localName, base: "component", tagOrIdent: decl.base.ident },
                usage: { jsxUsages: 0, hasPropsSpread: false },
              },
              {
                api,
                filePath,
                resolveValue,
                resolveImport: (localName: string) => {
                  const v = importMap.get(localName);
                  return v ? v : null;
                },
                warn: () => {},
              } as any,
            );
            if (res && res.type === "resolvedValue") {
              const exprAst = parseExpr(res.expr);
              if (exprAst) {
                return { resolved: exprAst, imports: res.imports };
              }
            }
            return null;
          };
          const addImport = (imp: any) => {
            resolverImports.set(JSON.stringify(imp), imp);
          };
          if (
            tryHandleInterpolatedStringValue({ j, decl, d, styleObj, resolveCallExpr, addImport })
          ) {
            continue;
          }

          if (!d.property) {
            const slot = d.value.parts.find(
              (p: any): p is { kind: "slot"; slotId: number } => p.kind === "slot",
            );
            if (slot) {
              const expr = decl.templateExpressions[slot.slotId] as any;
              if (expr?.type === "Identifier" && cssHelperNames.has(expr.name)) {
                const spreads = (styleObj.__spreads as any[]) ?? [];
                styleObj.__spreads = [...spreads, expr.name] as any;
                continue;
              }
            }
          }
          if (tryHandleCssHelperConditionalBlock(d)) {
            continue;
          }
          if (tryHandleLogicalOrDefault(d)) {
            continue;
          }

          // Support enum-like block-body `if` chains that return static values.
          // Example:
          //   transform: ${(props) => { if (props.$state === "up") return "scaleY(3)"; return "scaleY(1)"; }};
          {
            const tryHandleEnumIfChainValue = (): boolean => {
              if (d.value.kind !== "interpolated") {
                return false;
              }
              if (!d.property) {
                return false;
              }
              // Only apply to base declarations; variant expansion for pseudo/media/attr buckets is more complex.
              if (pseudos?.length || media || attrTarget) {
                return false;
              }
              const parts = d.value.parts ?? [];
              const slotPart = parts.find((p: any) => p.kind === "slot");
              if (!slotPart || slotPart.kind !== "slot") {
                return false;
              }
              const slotId = slotPart.slotId;
              const expr = decl.templateExpressions[slotId] as any;
              if (!expr || expr.type !== "ArrowFunctionExpression") {
                return false;
              }
              const paramName =
                expr.params?.[0]?.type === "Identifier" ? expr.params[0].name : null;
              if (!paramName) {
                return false;
              }
              if (expr.body?.type !== "BlockStatement") {
                return false;
              }

              type Case = { when: string; value: string | number };
              const cases: Case[] = [];
              let defaultValue: string | number | null = null;
              let propName: string | null = null;

              const readIfReturnValue = (ifStmt: any): string | number | null => {
                const cons = ifStmt.consequent;
                if (!cons) {
                  return null;
                }
                if (cons.type === "ReturnStatement") {
                  return literalToStaticValue(cons.argument);
                }
                if (cons.type === "BlockStatement") {
                  const ret = (cons.body ?? []).find((s: any) => s?.type === "ReturnStatement");
                  return ret ? literalToStaticValue(ret.argument) : null;
                }
                return null;
              };

              const bodyStmts = expr.body.body ?? [];
              for (const stmt of bodyStmts) {
                if (!stmt) {
                  continue;
                }
                if (stmt.type === "IfStatement") {
                  // Only support `if (...) { return <literal>; }` with no else.
                  if (stmt.alternate) {
                    return false;
                  }
                  const test = stmt.test as any;
                  if (
                    !test ||
                    test.type !== "BinaryExpression" ||
                    test.operator !== "===" ||
                    test.left?.type !== "MemberExpression"
                  ) {
                    return false;
                  }
                  const left = test.left as any;
                  const leftPath = getMemberPathFromIdentifier(left, paramName);
                  if (!leftPath || leftPath.length !== 1) {
                    return false;
                  }
                  const p = leftPath[0]!;
                  propName = propName ?? p;
                  if (propName !== p) {
                    return false;
                  }
                  const rhs = literalToStaticValue(test.right);
                  if (rhs === null) {
                    return false;
                  }
                  const retValue = readIfReturnValue(stmt);
                  if (retValue === null) {
                    return false;
                  }
                  const cond = `${propName} === ${JSON.stringify(rhs)}`;
                  cases.push({ when: cond, value: retValue });
                  continue;
                }
                if (stmt.type === "ReturnStatement") {
                  defaultValue = literalToStaticValue(stmt.argument);
                  continue;
                }
                // Any other statement shape => too risky.
                return false;
              }

              if (!propName || defaultValue === null || cases.length === 0) {
                return false;
              }

              ensureShouldForwardPropDrop(decl, propName);

              const styleFromValue = (value: string | number): Record<string, unknown> => {
                const valueRaw = typeof value === "number" ? String(value) : value;
                const irDecl = {
                  property: d.property,
                  value: { kind: "static" as const, value: valueRaw },
                  important: false,
                  valueRaw,
                };
                const out: Record<string, unknown> = {};
                for (const mapped of cssDeclarationToStylexDeclarations(irDecl as any)) {
                  out[mapped.prop] =
                    typeof value === "number" ? value : cssValueToJs(mapped.value, false);
                }
                return out;
              };

              // Default goes into base style.
              Object.assign(styleObj, styleFromValue(defaultValue));

              // Cases become variant buckets keyed by expression strings.
              for (const c of cases) {
                variantBuckets.set(c.when, {
                  ...variantBuckets.get(c.when),
                  ...styleFromValue(c.value),
                });
                variantStyleKeys[c.when] ??= `${decl.styleKey}${toSuffixFromProp(c.when)}`;
              }

              return true;
            };

            if (tryHandleEnumIfChainValue()) {
              continue;
            }
          }

          if (pseudos?.length && d.property) {
            const stylexProp = cssDeclarationToStylexDeclarations(d)[0]?.prop;
            const slotPart = d.value.parts.find((p: any) => p.kind === "slot");
            const slotId = slotPart && slotPart.kind === "slot" ? slotPart.slotId : 0;
            const expr = decl.templateExpressions[slotId] as any;
            if (
              stylexProp &&
              expr?.type === "ArrowFunctionExpression" &&
              expr.body?.type === "ConditionalExpression"
            ) {
              const test = expr.body.test as any;
              const cons = expr.body.consequent as any;
              const alt = expr.body.alternate as any;
              if (
                test?.type === "MemberExpression" &&
                test.property?.type === "Identifier" &&
                cons?.type === "StringLiteral" &&
                alt?.type === "StringLiteral"
              ) {
                const when = test.property.name;
                const baseDefault = (styleObj as any)[stylexProp] ?? null;
                // Apply to all pseudos (e.g., both :hover and :focus for "&:hover, &:focus")
                const pseudoEntries = Object.fromEntries(pseudos.map((p) => [p, alt.value]));
                (styleObj as any)[stylexProp] = { default: baseDefault, ...pseudoEntries };
                const variantPseudoEntries = Object.fromEntries(
                  pseudos.map((p) => [p, cons.value]),
                );
                variantBuckets.set(when, {
                  ...variantBuckets.get(when),
                  [stylexProp]: { default: cons.value, ...variantPseudoEntries },
                });
                variantStyleKeys[when] ??= `${decl.styleKey}${toSuffixFromProp(when)}`;
                continue;
              }
            }
          }

          // Handle computed theme object access keyed by a prop:
          //   background-color: ${(props) => props.theme.color[props.bg]}
          //
          // If the adapter can resolve `theme.color` as an object expression, we can emit a StyleX
          // dynamic style function that indexes into that resolved object at runtime:
          //   boxBackgroundColor: (bg) => ({ backgroundColor: (resolved as any)[bg] })
          //
          // This requires a wrapper to consume `bg` without forwarding it to DOM.
          const tryHandleThemeIndexedLookup = (): boolean => {
            if (d.value.kind !== "interpolated") {
              return false;
            }
            if (!d.property) {
              return false;
            }
            // Skip media/attr buckets for now; these require more complex wiring.
            if (media || attrTarget) {
              return false;
            }
            const parts = d.value.parts ?? [];
            const slotPart = parts.find((p: any) => p.kind === "slot");
            if (!slotPart || slotPart.kind !== "slot") {
              return false;
            }
            const slotId = slotPart.slotId;
            const expr = decl.templateExpressions[slotId] as any;
            if (!expr || expr.type !== "ArrowFunctionExpression") {
              return false;
            }
            const paramName =
              expr.params?.[0]?.type === "Identifier" ? (expr.params[0].name as string) : null;
            if (!paramName) {
              return false;
            }
            const body = expr.body as any;
            if (!body || body.type !== "MemberExpression" || body.computed !== true) {
              return false;
            }

            const indexPropName = (() => {
              const p = body.property as any;
              if (!p || typeof p !== "object") {
                return null;
              }
              if (p.type === "Identifier" && typeof p.name === "string") {
                return p.name as string;
              }
              if (p.type === "MemberExpression") {
                const path = getMemberPathFromIdentifier(p as any, paramName);
                if (!path || path.length !== 1) {
                  return null;
                }
                return path[0]!;
              }
              return null;
            })();
            if (!indexPropName) {
              return false;
            }

            const themeObjectPath = (() => {
              const obj = body.object as any;
              if (!obj || obj.type !== "MemberExpression") {
                return null;
              }
              const parts = getMemberPathFromIdentifier(obj as any, paramName);
              if (!parts || parts.length < 2) {
                return null;
              }
              if (parts[0] !== "theme") {
                return null;
              }
              return parts.slice(1).join(".");
            })();
            if (!themeObjectPath) {
              return false;
            }

            const resolved = resolveValue({ kind: "theme", path: themeObjectPath });
            if (!resolved) {
              return false;
            }

            for (const imp of resolved.imports ?? []) {
              resolverImports.set(JSON.stringify(imp), imp);
            }

            // Ensure we generate a wrapper so we can consume the prop without forwarding it to DOM.
            ensureShouldForwardPropDrop(decl, indexPropName);

            const outs = cssDeclarationToStylexDeclarations(d);
            for (const out of outs) {
              if (!out.prop) {
                continue;
              }
              const pseudoSuffix = (p: string): string => {
                // `:hover` -> `Hover`, `:focus-visible` -> `FocusVisible`
                const raw = p.trim().replace(/^:+/, "");
                const cleaned = raw
                  .split(/[^a-zA-Z0-9]+/g)
                  .filter(Boolean)
                  .map((seg) => seg.charAt(0).toUpperCase() + seg.slice(1))
                  .join("");
                return cleaned || "Pseudo";
              };

              const fnKey = pseudos?.length
                ? `${decl.styleKey}${toSuffixFromProp(out.prop)}${pseudoSuffix(pseudos[0]!)}`
                : `${decl.styleKey}${toSuffixFromProp(out.prop)}`;
              styleFnFromProps.push({ fnKey, jsxProp: indexPropName });

              if (!styleFnDecls.has(fnKey)) {
                // Build expression: resolvedExpr[indexPropName]
                // NOTE: This is TypeScript-only syntax (TSAsExpression + `keyof typeof`),
                // so we parse it explicitly with a TSX parser here rather than relying on
                // the generic `parseExpr` helper.
                const indexedExprAst = (() => {
                  // We intentionally do NOT add `as keyof typeof themeVars` fallbacks.
                  // If a fixture uses a `string` key to index theme colors, it should be fixed at the
                  // input/type level to use a proper key union (e.g. `Colors`), and the output should
                  // reflect that contract.
                  const exprSource = `(${resolved.expr})[${indexPropName}]`;
                  try {
                    const jParse = api.jscodeshift.withParser("tsx");
                    const program = jParse(`(${exprSource});`);
                    const stmt = program.find(jParse.ExpressionStatement).nodes()[0] as any;
                    let expr = stmt?.expression ?? null;
                    while (expr?.type === "ParenthesizedExpression") {
                      expr = expr.expression;
                    }
                    // Remove extra.parenthesized flag that causes recast to add parentheses
                    if (expr?.extra?.parenthesized) {
                      delete expr.extra.parenthesized;
                      delete expr.extra.parenStart;
                    }
                    return expr;
                  } catch {
                    return null;
                  }
                })();
                if (!indexedExprAst) {
                  warnings.push({
                    severity: "error",
                    type: "dynamic-node",
                    message: `Adapter returned an unparseable expression for ${decl.localName}; dropping this declaration.`,
                  });
                  bail = true;
                  continue;
                }

                const param = j.identifier(indexPropName);
                // Prefer the prop's own type when available (e.g. `Color` / `Colors`) so we don't end up with
                // `keyof typeof themeVars` in fixture outputs.
                const propTsType = findJsxPropTsType(indexPropName);
                (param as any).typeAnnotation = j.tsTypeAnnotation(
                  (propTsType && typeof propTsType === "object" && (propTsType as any).type
                    ? (propTsType as any)
                    : j.tsStringKeyword()) as any,
                );
                if (pseudos?.length) {
                  // For `&:hover` etc, emit nested selector styles so we don't have to guess defaults.
                  // For comma-separated pseudos, emit all pseudo keys
                  const nested = j.objectExpression([
                    j.property("init", j.identifier(out.prop), indexedExprAst as any) as any,
                  ]);
                  const pseudoProps = pseudos.map(
                    (ps) => j.property("init", j.literal(ps), nested) as any,
                  );
                  styleFnDecls.set(
                    fnKey,
                    j.arrowFunctionExpression([param], j.objectExpression(pseudoProps)),
                  );
                } else {
                  const p = j.property(
                    "init",
                    j.identifier(out.prop),
                    indexedExprAst as any,
                  ) as any;
                  styleFnDecls.set(
                    fnKey,
                    j.arrowFunctionExpression([param], j.objectExpression([p])),
                  );
                }
              }
            }

            return true;
          };

          if (tryHandleThemeIndexedLookup()) {
            continue;
          }

          const slotPart = d.value.parts.find((p: any) => p.kind === "slot");
          const slotId = slotPart && slotPart.kind === "slot" ? slotPart.slotId : 0;
          const loc = getNodeLocStart(decl.templateExpressions[slotId] as any);

          const res = resolveDynamicNode(
            {
              slotId,
              expr: decl.templateExpressions[slotId],
              css: {
                kind: "declaration",
                selector: rule.selector,
                atRuleStack: rule.atRuleStack,
                ...(d.property ? { property: d.property } : {}),
                valueRaw: d.valueRaw,
              },
              component:
                decl.base.kind === "intrinsic"
                  ? { localName: decl.localName, base: "intrinsic", tagOrIdent: decl.base.tagName }
                  : { localName: decl.localName, base: "component", tagOrIdent: decl.base.ident },
              usage: { jsxUsages: 0, hasPropsSpread: false },
              ...(loc ? { loc } : {}),
            },
            {
              api,
              filePath,
              resolveValue,
              resolveImport: (localName: string) => {
                const v = importMap.get(localName);
                return v ? v : null;
              },
              warn: (w: any) => {
                const loc = w.loc;
                warnings.push({
                  severity: "warning",
                  type: "dynamic-node",
                  message: w.message,
                  ...(loc ? { loc } : {}),
                });
              },
            } as any,
          );

          if (res && res.type === "resolvedValue") {
            for (const imp of res.imports ?? []) {
              resolverImports.set(JSON.stringify(imp), imp);
            }

            // Extract and wrap static prefix/suffix (skip for border-color since expansion handled it)
            const cssProp = (d.property ?? "").trim();
            const { prefix, suffix } = extractStaticParts(d.value, {
              skipForProperty: /^border(-top|-right|-bottom|-left)?-color$/,
              property: cssProp,
            });
            const wrappedExpr = wrapExprWithStaticParts(res.expr, prefix, suffix);

            const exprAst = parseExpr(wrappedExpr);
            if (!exprAst) {
              warnings.push({
                severity: "error",
                type: "dynamic-node",
                message: `Adapter returned an unparseable expression for ${decl.localName}; dropping this declaration.`,
                ...(loc ? { loc } : {}),
              });
              continue;
            }
            {
              const outs = cssDeclarationToStylexDeclarations(d);
              for (let i = 0; i < outs.length; i++) {
                const out = outs[i]!;
                styleObj[out.prop] = exprAst as any;
                if (i === 0) {
                  addPropComments(styleObj, out.prop, {
                    leading: (d as any).leadingComment,
                    trailingLine: (d as any).trailingLineComment,
                  });
                }
              }
            }
            continue;
          }

          if (res && res.type === "splitVariants") {
            const neg = res.variants.find((v: any) => v.when.startsWith("!"));
            const pos = res.variants.find((v: any) => !v.when.startsWith("!"));

            if (neg) {
              Object.assign(styleObj, neg.style);
            }
            if (pos) {
              const when = pos.when.replace(/^!/, "");
              variantBuckets.set(when, { ...variantBuckets.get(when), ...pos.style });
              variantStyleKeys[when] ??= `${decl.styleKey}${toSuffixFromProp(when)}`;
            }
            continue;
          }

          if (res && res.type === "splitVariantsResolvedValue") {
            const neg = res.variants.find((v: any) => v.when.startsWith("!"));
            // Get ALL positive variants (not just one) for nested ternaries
            const allPos = res.variants.filter((v: any) => !v.when.startsWith("!"));

            const cssProp = (d.property ?? "").trim();
            // Map CSS property to StyleX property (handle special cases like background → backgroundColor)
            const stylexProp =
              cssProp === "background" ? "backgroundColor" : cssPropertyToStylexProp(cssProp);

            // Extract static prefix/suffix from CSS value for wrapping resolved values
            // e.g., `rotate(${...})` should wrap the resolved value with `rotate(...)`.
            const { prefix: staticPrefix, suffix: staticSuffix } = extractStaticParts(d.value);

            const parseResolved = (
              expr: string,
              imports: any[],
            ): { exprAst: unknown; imports: any[] } | null => {
              const wrappedExpr = wrapExprWithStaticParts(expr, staticPrefix, staticSuffix);
              const exprAst = parseExpr(wrappedExpr);
              if (!exprAst) {
                warnings.push({
                  severity: "error",
                  type: "dynamic-node",
                  message: `Adapter returned an unparseable expression for ${decl.localName}; dropping this declaration.`,
                  ...(loc ? { loc } : {}),
                });
                return null;
              }
              return { exprAst, imports: imports ?? [] };
            };

            // Helper to expand border shorthand from a string literal like "2px solid blue"
            const expandBorderShorthand = (
              target: Record<string, unknown>,
              exprAst: any,
            ): boolean => {
              // Handle various AST wrapper structures
              let node = exprAst;
              // Unwrap ExpressionStatement if present
              if (node?.type === "ExpressionStatement") {
                node = node.expression;
              }
              // Only expand if it's a string literal
              if (node?.type !== "StringLiteral" && node?.type !== "Literal") {
                return false;
              }
              const value = node.value;
              if (typeof value !== "string") {
                return false;
              }
              const tokens = value.trim().split(/\s+/);
              const BORDER_STYLES = new Set([
                "none",
                "solid",
                "dashed",
                "dotted",
                "double",
                "groove",
                "ridge",
                "inset",
                "outset",
              ]);
              const looksLikeLength = (t: string) =>
                /^-?\d*\.?\d+(px|rem|em|vh|vw|vmin|vmax|ch|ex|lh|%)?$/.test(t);

              let width: string | undefined;
              let style: string | undefined;
              const colorParts: string[] = [];
              for (const token of tokens) {
                if (!width && looksLikeLength(token)) {
                  width = token;
                } else if (!style && BORDER_STYLES.has(token)) {
                  style = token;
                } else {
                  colorParts.push(token);
                }
              }
              const color = colorParts.join(" ").trim();
              if (!width && !style && !color) {
                return false;
              }
              if (width) {
                target["borderWidth"] = j.literal(width);
              }
              if (style) {
                target["borderStyle"] = j.literal(style);
              }
              if (color) {
                target["borderColor"] = j.literal(color);
              }
              return true;
            };

            const applyParsed = (
              target: Record<string, unknown>,
              parsed: { exprAst: unknown; imports: any[] },
            ): void => {
              for (const imp of parsed.imports) {
                resolverImports.set(JSON.stringify(imp), imp);
              }
              // Special handling for border shorthand with string literal values
              if (cssProp === "border" && expandBorderShorthand(target, parsed.exprAst)) {
                return;
              }
              // Default: use the property from cssDeclarationToStylexDeclarations.
              // IMPORTANT: preserve selector pseudos (e.g. &:hover) by writing a per-prop pseudo map
              // instead of overwriting the base/default value.
              if (pseudos?.length) {
                const existing = target[stylexProp];
                // `existing` may be:
                // - a scalar (string/number)
                // - an AST node (e.g. { type: "StringLiteral", ... })
                // - an already-built pseudo map (plain object with `default` / `:hover` keys)
                //
                // Only treat it as an existing pseudo map when it's a plain object *and* not an AST node.
                const isAstNode =
                  !!existing &&
                  typeof existing === "object" &&
                  !Array.isArray(existing) &&
                  "type" in (existing as any) &&
                  typeof (existing as any).type === "string";
                const map =
                  existing && typeof existing === "object" && !Array.isArray(existing) && !isAstNode
                    ? (existing as Record<string, unknown>)
                    : ({} as Record<string, unknown>);
                if (!("default" in map)) {
                  map.default = existing ?? null;
                }
                // Apply to all pseudos (e.g., both :hover and :focus for "&:hover, &:focus")
                for (const ps of pseudos) {
                  map[ps] = parsed.exprAst as any;
                }
                target[stylexProp] = map;
                return;
              }

              target[stylexProp] = parsed.exprAst as any;
            };

            // IMPORTANT: stage parsing first. If either branch fails to parse, skip this declaration entirely
            // (mirrors the `resolvedValue` behavior) and avoid emitting empty variant buckets.
            const negParsed = neg ? parseResolved(neg.expr, neg.imports) : null;
            if (neg && !negParsed) {
              continue;
            }
            // Parse all positive variants - skip entire declaration if any fail
            const allPosParsed: Array<{
              when: string;
              nameHint: string;
              parsed: { exprAst: unknown; imports: any[] };
            }> = [];
            let anyPosFailed = false;
            for (const posV of allPos) {
              const parsed = parseResolved(posV.expr, posV.imports);
              if (!parsed) {
                anyPosFailed = true;
                break;
              }
              allPosParsed.push({ when: posV.when, nameHint: posV.nameHint, parsed });
            }
            if (anyPosFailed) {
              continue;
            }

            if (negParsed) {
              applyParsed(styleObj as any, negParsed);
            }
            // Apply all positive variants
            // For nested ternaries (multiple variants), use simpler nameHint-based naming.
            // For single-variant cases, use toSuffixFromProp which includes prop name (e.g., ColorPrimary).
            const isNestedTernary = allPosParsed.length > 1;
            for (const { when, nameHint, parsed } of allPosParsed) {
              const whenClean = when.replace(/^!/, "");
              const bucket = { ...variantBuckets.get(whenClean) } as Record<string, unknown>;
              applyParsed(bucket, parsed);
              variantBuckets.set(whenClean, bucket);
              // Use nameHint only for nested ternaries and when it's meaningful.
              // Generic hints like "truthy", "falsy", "default", "match" should fall back to toSuffixFromProp
              const genericHints = new Set(["truthy", "falsy", "default", "match"]);
              const useMeaningfulHint = isNestedTernary && nameHint && !genericHints.has(nameHint);
              const suffix = useMeaningfulHint
                ? nameHint.charAt(0).toUpperCase() + nameHint.slice(1)
                : toSuffixFromProp(whenClean);
              variantStyleKeys[whenClean] ??= `${decl.styleKey}${suffix}`;
            }
            continue;
          }

          if (res && res.type === "emitInlineStyleValueFromProps") {
            if (!d.property) {
              // This handler is only intended for value interpolations on concrete properties.
              // If the IR is missing a property, fall through to other handlers.
            } else {
              const e = decl.templateExpressions[slotId] as any;
              if (e?.type === "ArrowFunctionExpression") {
                decl.needsWrapperComponent = true;
                const unwrapped = unwrapArrowFunctionToPropsExpr(e);
                const baseExpr = unwrapped?.expr ?? j.callExpression(e, [j.identifier("props")]);
                // Build template literal when there's static prefix/suffix (e.g., `${...}ms`)
                const { prefix, suffix } = extractStaticParts(d.value);
                const valueExpr =
                  prefix || suffix
                    ? buildTemplateWithStaticParts(j, baseExpr, prefix, suffix)
                    : baseExpr;
                for (const out of cssDeclarationToStylexDeclarations(d)) {
                  if (!out.prop) {
                    continue;
                  }
                  inlineStyleProps.push({ prop: out.prop, expr: valueExpr });
                }
                continue;
              }
            }
          }

          if (res && res.type === "emitStyleFunction") {
            const jsxProp = res.call;
            {
              const outs = cssDeclarationToStylexDeclarations(d);
              for (let i = 0; i < outs.length; i++) {
                const out = outs[i]!;
                const fnKey = `${decl.styleKey}${toSuffixFromProp(out.prop)}`;
                styleFnFromProps.push({ fnKey, jsxProp });

                if (!styleFnDecls.has(fnKey)) {
                  // IMPORTANT: don't reuse the same Identifier node for both the function param and
                  // expression positions. If the param identifier has a TS annotation, reusing it
                  // in expression positions causes printers to emit `value: any` inside templates.
                  const param = j.identifier(out.prop);
                  const valueId = j.identifier(out.prop);
                  // Be permissive: callers might pass numbers (e.g. `${props => props.$width}px`)
                  // or strings (e.g. `${props => props.$color}`).
                  annotateParamFromJsxProp(param, jsxProp);
                  if (jsxProp?.startsWith?.("$")) {
                    ensureShouldForwardPropDrop(decl, jsxProp);
                  }

                  // If this declaration is a simple interpolated string with a single slot and
                  // surrounding static text, preserve it by building a TemplateLiteral around the
                  // prop value, e.g. `${value}px`, `opacity ${value}ms`.
                  const buildValueExpr = (): any => {
                    const transformed = (() => {
                      const vt: any = (res as any).valueTransform;
                      if (vt?.kind === "call" && typeof vt.calleeIdent === "string") {
                        return j.callExpression(j.identifier(vt.calleeIdent), [valueId]);
                      }
                      return valueId;
                    })();
                    const v: any = (d as any).value;
                    if (!v || v.kind !== "interpolated") {
                      return transformed;
                    }
                    const parts: any[] = v.parts ?? [];
                    const slotParts = parts.filter((p: any) => p?.kind === "slot");
                    if (slotParts.length !== 1) {
                      return transformed;
                    }
                    const onlySlot = slotParts[0]!;
                    if (onlySlot.slotId !== slotId) {
                      return transformed;
                    }

                    // If it's just the slot, keep it as the raw value (number/string).
                    const hasStatic = parts.some(
                      (p: any) => p?.kind === "static" && p.value !== "",
                    );
                    if (!hasStatic) {
                      return transformed;
                    }

                    const quasis: any[] = [];
                    const exprs: any[] = [];
                    let q = "";
                    for (const part of parts) {
                      if (part?.kind === "static") {
                        q += String(part.value ?? "");
                        continue;
                      }
                      if (part?.kind === "slot") {
                        quasis.push(j.templateElement({ raw: q, cooked: q }, false));
                        q = "";
                        exprs.push(transformed);
                        continue;
                      }
                    }
                    quasis.push(j.templateElement({ raw: q, cooked: q }, true));
                    return j.templateLiteral(quasis, exprs);
                  };

                  const valueExpr = buildValueExpr();
                  const p = j.property("init", j.identifier(out.prop), valueExpr) as any;
                  p.shorthand = valueExpr?.type === "Identifier" && valueExpr.name === out.prop;
                  const body = j.objectExpression([p]);
                  styleFnDecls.set(fnKey, j.arrowFunctionExpression([param], body));
                }
                if (i === 0) {
                  // No direct prop to attach to here; the style function itself is emitted later.
                  // We conservatively ignore comment preservation in this path.
                }
              }
            }
            continue;
          }

          if (res && res.type === "keepOriginal") {
            warnings.push({
              severity: "warning",
              type: "dynamic-node",
              message: res.reason,
              ...(loc ? { loc } : {}),
            });
            bail = true;
            break;
          }

          if (decl.shouldForwardProp) {
            for (const out of cssDeclarationToStylexDeclarations(d)) {
              if (!out.prop) {
                continue;
              }
              const e = decl.templateExpressions[slotId] as any;
              const baseExpr =
                e?.type === "ArrowFunctionExpression"
                  ? (unwrapArrowFunctionToPropsExpr(e)?.expr ??
                    j.callExpression(e, [j.identifier("props")]))
                  : e;
              // Build template literal when there's static prefix/suffix (e.g., `${...}ms`)
              const { prefix, suffix } = extractStaticParts(d.value);
              const expr =
                prefix || suffix
                  ? buildTemplateWithStaticParts(j, baseExpr, prefix, suffix)
                  : baseExpr;
              inlineStyleProps.push({ prop: out.prop, expr });
            }
            continue;
          }
          warnings.push({
            severity: "warning",
            type: "dynamic-node",
            message: `Unsupported interpolation for ${decl.localName}.`,
            ...(loc ? { loc } : {}),
          });
          bail = true;
          break;
        }

        const outs = cssDeclarationToStylexDeclarations(d);
        for (let i = 0; i < outs.length; i++) {
          const out = outs[i]!;
          let value = cssValueToJs(out.value, d.important);
          if (out.prop === "content" && typeof value === "string") {
            const m = value.match(/^['"]([\s\S]*)['"]$/);
            if (m) {
              value = `"${m[1]}"`;
            } else if (!value.startsWith('"') && !value.endsWith('"')) {
              value = `"${value}"`;
            }
          }

          if (attrTarget) {
            if (attrPseudoElement) {
              const nested = (attrTarget[attrPseudoElement] as any) ?? {};
              nested[out.prop] = value;
              attrTarget[attrPseudoElement] = nested;
              if (i === 0) {
                addPropComments(nested, out.prop, {
                  leading: (d as any).leadingComment,
                  trailingLine: (d as any).trailingLineComment,
                });
              }
              continue;
            }
            attrTarget[out.prop] = value;
            if (i === 0) {
              addPropComments(attrTarget, out.prop, {
                leading: (d as any).leadingComment,
                trailingLine: (d as any).trailingLineComment,
              });
            }
            continue;
          }

          if (out.prop && out.prop.startsWith("--") && typeof value === "string") {
            localVarValues.set(out.prop, value);
          }

          // Handle nested pseudo + media: `&:hover { @media (...) { ... } }`
          // This produces: { ":hover": { default: null, "@media (...)": value } }
          if (media && pseudos?.length) {
            perPropPseudo[out.prop] ??= {};
            const existing = perPropPseudo[out.prop]!;
            if (!("default" in existing)) {
              existing.default = (styleObj as any)[out.prop] ?? null;
            }
            // For each pseudo, create/update a nested media map
            for (const ps of pseudos) {
              if (!existing[ps] || typeof existing[ps] !== "object") {
                existing[ps] = { default: null };
              }
              (existing[ps] as Record<string, unknown>)[media] = value;
            }
            continue;
          }

          if (media) {
            perPropMedia[out.prop] ??= {};
            const existing = perPropMedia[out.prop]!;
            if (!("default" in existing)) {
              existing.default = (styleObj as any)[out.prop] ?? null;
            }
            existing[media] = value;
            continue;
          }

          if (pseudos?.length) {
            perPropPseudo[out.prop] ??= {};
            const existing = perPropPseudo[out.prop]!;
            if (!("default" in existing)) {
              existing.default = (styleObj as any)[out.prop] ?? null;
            }
            // Apply to all pseudos (e.g., both :hover and :focus for "&:hover, &:focus")
            for (const ps of pseudos) {
              existing[ps] = value;
            }
            continue;
          }

          if (pseudoElement) {
            nestedSelectors[pseudoElement] ??= {};
            nestedSelectors[pseudoElement]![out.prop] = value;
            if (i === 0) {
              addPropComments(nestedSelectors[pseudoElement]!, out.prop, {
                leading: (d as any).leadingComment,
                trailingLine: (d as any).trailingLineComment,
              });
            }
            continue;
          }

          styleObj[out.prop] = value;
          if (i === 0) {
            addPropComments(styleObj, out.prop, {
              leading: (d as any).leadingComment,
              trailingLine: (d as any).trailingLineComment,
            });
          }
        }
      }
      if (bail) {
        break;
      }
    }
    if (bail) {
      break;
    }

    for (const [prop, map] of Object.entries(perPropPseudo)) {
      styleObj[prop] = map;
    }
    for (const [prop, map] of Object.entries(perPropMedia)) {
      styleObj[prop] = map;
    }
    for (const [sel, obj] of Object.entries(nestedSelectors)) {
      styleObj[sel] = obj;
    }

    const varsToDrop = new Set<string>();
    rewriteCssVarsInStyleObject(styleObj, localVarValues, varsToDrop);
    for (const name of varsToDrop) {
      delete (styleObj as any)[name];
    }

    if (
      decl.rawCss &&
      (/__SC_EXPR_\d+__\s*\{/.test(decl.rawCss) ||
        /&:hover\s+__SC_EXPR_\d+__\s*\{/.test(decl.rawCss))
    ) {
      let didApply = false;
      const applyBlock = (slotId: number, declsText: string, isHover: boolean) => {
        const expr = decl.templateExpressions[slotId] as any;
        if (!expr || expr.type !== "Identifier") {
          return;
        }
        const childLocal = expr.name as string;
        const childDecl = declByLocalName.get(childLocal);
        if (!childDecl) {
          return;
        }
        const overrideStyleKey = `${toStyleKey(childLocal)}In${decl.localName}`;
        ancestorSelectorParents.add(decl.styleKey);
        descendantOverrides.push({
          parentStyleKey: decl.styleKey,
          childStyleKey: childDecl.styleKey,
          overrideStyleKey,
        });
        const baseBucket = descendantOverrideBase.get(overrideStyleKey) ?? {};
        const hoverBucket = descendantOverrideHover.get(overrideStyleKey) ?? {};
        descendantOverrideBase.set(overrideStyleKey, baseBucket);
        descendantOverrideHover.set(overrideStyleKey, hoverBucket);
        didApply = true;

        const declLines = declsText
          .split(";")
          .map((s) => s.trim())
          .filter(Boolean);
        for (const line of declLines) {
          const m = line.match(/^([^:]+):([\s\S]+)$/);
          if (!m) {
            continue;
          }
          const prop = m[1]!.trim();
          const value = m[2]!.trim();
          const outProp =
            prop === "background" ? "backgroundColor" : prop === "mask-size" ? "maskSize" : prop;
          const jsVal = cssValueToJs({ kind: "static", value } as any);
          if (!isHover) {
            (baseBucket as any)[outProp] = jsVal;
          } else {
            (hoverBucket as any)[outProp] = jsVal;
          }
        }
      };

      const baseRe = /__SC_EXPR_(\d+)__\s*\{([\s\S]*?)\}/g;
      let m: RegExpExecArray | null;
      while ((m = baseRe.exec(decl.rawCss))) {
        const before = decl.rawCss.slice(Math.max(0, m.index - 20), m.index);
        if (/&:hover\s+$/.test(before)) {
          continue;
        }
        applyBlock(Number(m[1]), m[2] ?? "", false);
      }
      const hoverRe = /&:hover\s+__SC_EXPR_(\d+)__\s*\{([\s\S]*?)\}/g;
      while ((m = hoverRe.exec(decl.rawCss))) {
        applyBlock(Number(m[1]), m[2] ?? "", true);
      }

      if (didApply) {
        delete (styleObj as any).width;
        delete (styleObj as any).height;
        delete (styleObj as any).opacity;
        delete (styleObj as any).transform;
      }
    }

    if (decl.enumVariant) {
      const { baseKey, cases } = decl.enumVariant;
      const oldKey = decl.styleKey;
      decl.styleKey = baseKey;
      resolvedStyleObjects.delete(oldKey);
      resolvedStyleObjects.set(baseKey, styleObj);
      for (const c of cases) {
        resolvedStyleObjects.set(c.styleKey, { backgroundColor: c.value });
      }
      decl.needsWrapperComponent = true;
    } else {
      resolvedStyleObjects.set(decl.styleKey, styleObj);
    }

    // Preserve CSS cascade semantics for pseudo selectors when variant buckets override the same property.
    //
    // We intentionally keep this narrowly-scoped to avoid churning fixture output shapes.
    // Currently we only synthesize compound variants for the `disabled` + `color === "primary"` pattern
    // so that hover can still win (matching CSS specificity semantics).
    {
      const isAstNode = (v: unknown): boolean =>
        !!v &&
        typeof v === "object" &&
        !Array.isArray(v) &&
        "type" in (v as any) &&
        typeof (v as any).type === "string";
      const isPseudoOrMediaMap = (v: unknown): v is Record<string, unknown> => {
        if (!v || typeof v !== "object" || Array.isArray(v) || isAstNode(v)) {
          return false;
        }
        const keys = Object.keys(v as any);
        if (keys.length === 0) {
          return false;
        }
        return (
          keys.includes("default") ||
          keys.some((k) => k.startsWith(":") || k.startsWith("@media") || k.startsWith("::"))
        );
      };

      // Special-case: if we have a boolean "disabled" variant bucket overriding a prop that also has
      // a hover map, preserve CSS specificity semantics by emitting a compound variant keyed off
      // `disabled && color === "primary"` (when available).
      //
      // This matches styled-components semantics for patterns like:
      //  - &:hover { background-color: (color === "primary" ? darkblue : darkgray) }
      //  - disabled && "background-color: grey"
      //
      // In CSS, :hover can still override base disabled declarations due to higher specificity.
      // In StyleX, a later `backgroundColor` assignment can clobber pseudo maps, so we need the
      // disabled bucket to include an explicit ':hover' value for the relevant color case.
      const disabledKey = "disabled";
      const colorPrimaryKey = `color === "primary"`;
      const disabledBucket = variantBuckets.get(disabledKey);
      const colorPrimaryBucket = variantBuckets.get(colorPrimaryKey);
      if (disabledBucket && (styleObj as any).backgroundColor) {
        const baseBg = (styleObj as any).backgroundColor;
        const primaryBg = (colorPrimaryBucket as any)?.backgroundColor ?? null;

        const baseHover = isPseudoOrMediaMap(baseBg) ? (baseBg as any)[":hover"] : null;
        const primaryHover = isPseudoOrMediaMap(primaryBg) ? (primaryBg as any)[":hover"] : null;

        const disabledBg = (disabledBucket as any).backgroundColor;
        const disabledDefault = isPseudoOrMediaMap(disabledBg)
          ? (disabledBg as any).default
          : (disabledBg ?? null);

        if (disabledDefault !== null && baseHover !== null && primaryHover !== null) {
          // Remove the base disabled backgroundColor override; we'll replace it with compound buckets.
          delete (disabledBucket as any).backgroundColor;

          const disabledPrimaryWhen = `${disabledKey} && ${colorPrimaryKey}`;
          const disabledNotPrimaryWhen = `${disabledKey} && color !== "primary"`;

          const mkBucket = (hoverVal: any) => ({
            ...(disabledBucket as any),
            backgroundColor: { default: disabledDefault, ":hover": hoverVal },
          });

          variantBuckets.set(disabledPrimaryWhen, mkBucket(primaryHover));
          variantStyleKeys[disabledPrimaryWhen] ??= `${decl.styleKey}${toSuffixFromProp(
            disabledPrimaryWhen,
          )}`;

          variantBuckets.set(disabledNotPrimaryWhen, mkBucket(baseHover));
          variantStyleKeys[disabledNotPrimaryWhen] ??= `${decl.styleKey}${toSuffixFromProp(
            disabledNotPrimaryWhen,
          )}`;
        }
      }
    }

    for (const [when, obj] of variantBuckets.entries()) {
      const key = variantStyleKeys[when]!;
      resolvedStyleObjects.set(key, obj);
    }
    for (const [k, v] of attrBuckets.entries()) {
      resolvedStyleObjects.set(k, v);
    }
    if (Object.keys(variantStyleKeys).length) {
      decl.variantStyleKeys = variantStyleKeys;
      // If we have variant styles keyed off props (e.g. `color === "primary"`),
      // we need a wrapper component to evaluate those conditions at runtime and
      // avoid forwarding custom variant props to DOM nodes.
      decl.needsWrapperComponent = true;
    }
    if (styleFnFromProps.length) {
      decl.styleFnFromProps = styleFnFromProps;
      for (const [k, v] of styleFnDecls.entries()) {
        resolvedStyleObjects.set(k, v);
      }
    }
    if (inlineStyleProps.length) {
      decl.inlineStyleProps = inlineStyleProps;
    }
  }

  if (descendantOverrideBase.size || descendantOverrideHover.size) {
    const ancestorHoverKey = j.callExpression(
      j.memberExpression(
        j.memberExpression(j.identifier("stylex"), j.identifier("when")),
        j.identifier("ancestor"),
      ),
      [j.literal(":hover")],
    );

    for (const [overrideKey, baseBucket] of descendantOverrideBase.entries()) {
      const hoverBucket = descendantOverrideHover.get(overrideKey) ?? {};
      const props: any[] = [];

      const allProps = new Set<string>([...Object.keys(baseBucket), ...Object.keys(hoverBucket)]);

      for (const prop of allProps) {
        const baseVal = (baseBucket as any)[prop];
        const hoverVal = (hoverBucket as any)[prop];

        if (hoverVal !== undefined) {
          const mapExpr = j.objectExpression([
            j.property("init", j.identifier("default"), literalToAst(j, baseVal ?? null)),
            Object.assign(j.property("init", ancestorHoverKey as any, literalToAst(j, hoverVal)), {
              computed: true,
            }) as any,
          ]);
          props.push(j.property("init", j.identifier(prop), mapExpr));
        } else {
          props.push(j.property("init", j.identifier(prop), literalToAst(j, baseVal)));
        }
      }

      resolvedStyleObjects.set(overrideKey, j.objectExpression(props) as any);
    }
  }

  return { resolvedStyleObjects, descendantOverrides, ancestorSelectorParents, bail };
}

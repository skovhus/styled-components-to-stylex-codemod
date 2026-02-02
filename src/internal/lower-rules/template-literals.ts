import type { Expression, JSCodeshift, TemplateLiteral } from "jscodeshift";
import { compile } from "stylis";
import type { Adapter, ImportSource, ImportSpec } from "../../adapter.js";
import { resolveDynamicNode, type InternalHandlerContext } from "../builtin-handlers.js";
import {
  cssDeclarationToStylexDeclarations,
  cssPropertyToStylexProp,
  parseInterpolatedBorderStaticParts,
} from "../css-prop-mapping.js";
import { isStylexLonghandOnlyShorthand } from "../stylex-shorthands.js";
import { normalizeStylisAstToIR } from "../css-ir.js";
import {
  extractRootAndPath,
  getMemberPathFromIdentifier,
  getNodeLocStart,
  isCallExpressionNode,
  isConditionalExpressionNode,
  isLogicalExpressionNode,
  type CallExpressionNode,
} from "../utilities/jscodeshift-utils.js";
import { parseStyledTemplateLiteral } from "../styled-css.js";
import { extractStaticParts } from "./interpolations.js";
import { buildTemplateWithStaticParts } from "./inline-styles.js";
import { literalToStaticValue } from "./types.js";

type ExpressionKind = Parameters<JSCodeshift["expressionStatement"]>[0];

type ImportMeta = { importedName: string; source: ImportSource };

type ResolveImportInScope = (localName: string, identNode?: unknown) => ImportMeta | null;

type ComponentInfo =
  | {
      localName: string;
      base: "intrinsic";
      tagOrIdent: string;
      withConfig?: { shouldForwardProp?: boolean };
    }
  | {
      localName: string;
      base: "component";
      tagOrIdent: string;
      withConfig?: { shouldForwardProp?: boolean };
    };

export type TemplateDynamicEntry = {
  jsxProp: string;
  stylexProp: string;
  callArg: ExpressionKind;
};

export type TemplateInlineEntry = {
  jsxProp: string;
  prop: string;
  callArg: ExpressionKind;
};

export type TemplateLiteralBranchResult = {
  style: Record<string, unknown>;
  dynamicEntries: TemplateDynamicEntry[];
  inlineEntries: TemplateInlineEntry[];
};

export type TemplateLiteralBranchArgs = {
  j: JSCodeshift;
  node: TemplateLiteral;
  paramName: string | null;
  filePath: string;
  parseExpr: (exprSource: string) => ExpressionKind | null;
  cssValueToJs: (value: unknown, important?: boolean, propName?: string) => unknown;
  resolveValue: Adapter["resolveValue"];
  resolveCall: Adapter["resolveCall"];
  resolveImportInScope: ResolveImportInScope;
  resolverImports: Map<string, ImportSpec>;
  componentInfo: ComponentInfo;
  handlerContext: InternalHandlerContext;
};

export type TemplateLiteralValueArgs = {
  j: JSCodeshift;
  tpl: TemplateLiteral;
  property: string;
  filePath: string;
  parseExpr: (exprSource: string) => ExpressionKind | null;
  resolveCall: Adapter["resolveCall"];
  resolveImportInScope: ResolveImportInScope;
  resolverImports: Map<string, ImportSpec>;
  componentInfo: ComponentInfo;
  handlerContext: InternalHandlerContext;
};

export function resolveTemplateLiteralBranch(
  args: TemplateLiteralBranchArgs,
): TemplateLiteralBranchResult | null {
  const {
    j,
    node,
    paramName,
    filePath,
    parseExpr,
    cssValueToJs,
    resolveValue,
    resolveCall,
    resolveImportInScope,
    resolverImports,
    componentInfo,
    handlerContext,
  } = args;

  const parsed = parseStyledTemplateLiteral(node);
  const wrappedRawCss = `& { ${parsed.rawCss} }`;
  const stylisAst = compile(wrappedRawCss);
  const rules = normalizeStylisAstToIR(stylisAst, parsed.slots, {
    rawCss: wrappedRawCss,
  });
  const slotExprById = new Map<number, Expression>(
    parsed.slots.map((s) => [s.index, s.expression]),
  );
  const style: Record<string, unknown> = {};
  const dynamicEntries: TemplateDynamicEntry[] = [];
  const inlineEntries: TemplateInlineEntry[] = [];

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
          style[mapped.prop] = value;
        }
        continue;
      }
      if (d.important) {
        return null;
      }
      if (d.value.kind !== "interpolated") {
        return null;
      }
      const parts = d.value.parts ?? [];
      const slotParts = parts.filter((p) => p.kind === "slot");
      if (slotParts.length === 0) {
        return null;
      }

      const resolvedSlots = new Map<
        number,
        | { kind: "dynamic"; jsxProp: string; callArg: ExpressionKind }
        | { kind: "static"; exprAst: ExpressionKind }
      >();

      for (const sp of slotParts) {
        const slotId = sp.slotId;
        const expr = slotExprById.get(slotId);
        if (!expr) {
          return null;
        }

        const propResolved = resolveDynamicTemplateExpr({
          j,
          expr,
          paramName,
          filePath,
          parseExpr,
          resolveValue,
          resolverImports,
        });
        if (propResolved) {
          resolvedSlots.set(slotId, {
            kind: "dynamic",
            jsxProp: propResolved.jsxProp,
            callArg: propResolved.callArg,
          });
          continue;
        }

        const resolvedExprAst = resolveStaticTemplateExpressionAst({
          expr,
          property: d.property,
          valueRaw: d.valueRaw ?? "",
          filePath,
          parseExpr,
          resolveCall,
          resolveImportInScope,
          resolverImports,
          componentInfo,
          handlerContext,
        });
        if (resolvedExprAst) {
          resolvedSlots.set(slotId, { kind: "static", exprAst: resolvedExprAst });
          continue;
        }

        return null;
      }

      const allStatic = [...resolvedSlots.values()].every((r) => r.kind === "static");

      if (allStatic) {
        const quasis: Array<ReturnType<JSCodeshift["templateElement"]>> = [];
        const expressions: ExpressionKind[] = [];
        let currentStaticPart = "";

        for (const part of parts) {
          if (part.kind === "static") {
            currentStaticPart += part.value;
          } else if (part.kind === "slot") {
            quasis.push(
              j.templateElement({ raw: currentStaticPart, cooked: currentStaticPart }, false),
            );
            currentStaticPart = "";
            const resolved = resolvedSlots.get(part.slotId);
            if (resolved?.kind === "static") {
              expressions.push(resolved.exprAst);
            }
          }
        }
        quasis.push(j.templateElement({ raw: currentStaticPart, cooked: currentStaticPart }, true));

        const templateLiteral = j.templateLiteral(quasis, expressions);
        for (const mapped of cssDeclarationToStylexDeclarations(d)) {
          style[mapped.prop] = templateLiteral;
        }
        continue;
      }

      if (slotParts.length !== 1) {
        return null;
      }
      const slotPart = slotParts[0];
      if (!slotPart) {
        return null;
      }
      const resolved = resolvedSlots.get(slotPart.slotId);
      if (!resolved || resolved.kind !== "dynamic") {
        return null;
      }
      const propName = d.property?.trim() ?? "";
      const { prefix, suffix } = extractStaticParts(d.value, { property: propName });
      const borderParts = parseInterpolatedBorderStaticParts({
        prop: propName,
        prefix,
        suffix,
      });
      if (borderParts) {
        if (borderParts.width) {
          style[borderParts.widthProp] = borderParts.width;
        }
        if (borderParts.style) {
          style[borderParts.styleProp] = borderParts.style;
        }
        dynamicEntries.push({
          jsxProp: resolved.jsxProp,
          stylexProp: borderParts.colorProp,
          callArg: resolved.callArg,
        });
        continue;
      }
      const isLonghandOnlyShorthand = isStylexLonghandOnlyShorthand(propName);
      const callArg =
        prefix || suffix
          ? buildTemplateWithStaticParts(j, resolved.callArg, prefix, suffix)
          : resolved.callArg;
      if (isLonghandOnlyShorthand) {
        inlineEntries.push({
          jsxProp: resolved.jsxProp,
          prop: cssPropertyToStylexProp(propName),
          callArg,
        });
        continue;
      }
      for (const mapped of cssDeclarationToStylexDeclarations(d)) {
        dynamicEntries.push({
          jsxProp: resolved.jsxProp,
          stylexProp: mapped.prop,
          callArg,
        });
      }
    }
  }
  return { style, dynamicEntries, inlineEntries };
}

export function resolveTemplateLiteralValue(args: TemplateLiteralValueArgs): ExpressionKind | null {
  const {
    j,
    tpl,
    property,
    filePath,
    parseExpr,
    resolveCall,
    resolveImportInScope,
    resolverImports,
    componentInfo,
    handlerContext,
  } = args;
  const quasis = tpl.quasis ?? [];
  const expressions = tpl.expressions ?? [];

  if (expressions.length === 0) {
    const staticValue = quasis.map((q) => q.value?.cooked ?? q.value?.raw ?? "").join("");
    return j.literal(staticValue);
  }

  const resolvedExprs: ExpressionKind[] = [];
  for (const expr of expressions) {
    const resolvedExpr = resolveStaticTemplateExpressionAst({
      expr,
      property,
      valueRaw: "",
      filePath,
      parseExpr,
      resolveCall,
      resolveImportInScope,
      resolverImports,
      componentInfo,
      handlerContext,
    });
    if (!resolvedExpr) {
      return null;
    }
    resolvedExprs.push(resolvedExpr);
  }

  const newQuasis = quasis.map((q, i) =>
    j.templateElement(
      { raw: q.value?.raw ?? "", cooked: q.value?.cooked ?? q.value?.raw ?? "" },
      i === quasis.length - 1,
    ),
  );
  return j.templateLiteral(newQuasis, resolvedExprs);
}

function resolveDynamicTemplateExpr(args: {
  j: JSCodeshift;
  expr: Expression;
  paramName: string | null;
  filePath: string;
  parseExpr: (exprSource: string) => ExpressionKind | null;
  resolveValue: Adapter["resolveValue"];
  resolverImports: Map<string, ImportSpec>;
}): { jsxProp: string; callArg: ExpressionKind } | null {
  const { j, expr, paramName, filePath, parseExpr, resolveValue, resolverImports } = args;
  if (!paramName) {
    return null;
  }
  const exprType = expr.type;
  if (exprType === "MemberExpression" || exprType === "OptionalMemberExpression") {
    const propPath = getMemberPathFromIdentifier(expr, paramName);
    if (!propPath || propPath.length !== 1) {
      return null;
    }
    const jsxProp = propPath[0]!;
    if (jsxProp === "theme") {
      return null;
    }
    return { jsxProp, callArg: buildPropAccessExpr(j, jsxProp) };
  }
  if (exprType === "LogicalExpression" && isLogicalExpressionNode(expr) && expr.operator === "??") {
    const left = expr.left;
    const right = expr.right;
    const propPath = getMemberPathFromIdentifier(left, paramName);
    if (!propPath || propPath.length !== 1) {
      return null;
    }
    const jsxProp = propPath[0]!;
    if (jsxProp === "theme") {
      return null;
    }
    const themeAst = resolveThemeFromPropsMember({
      expr: right,
      paramName,
      filePath,
      parseExpr,
      resolveValue,
      resolverImports,
    });
    const baseArg = buildPropAccessExpr(j, jsxProp);
    if (themeAst) {
      return {
        jsxProp,
        callArg: j.logicalExpression("??", baseArg, themeAst),
      };
    }
    // Try to resolve the right side as a static literal value
    const staticValue = literalToStaticValue(right);
    if (staticValue !== null) {
      const literalAst = j.literal(staticValue);
      return {
        jsxProp,
        callArg: j.logicalExpression("??", baseArg, literalAst),
      };
    }
    return null;
  }
  if (exprType === "ConditionalExpression" && isConditionalExpressionNode(expr)) {
    const propPath = getMemberPathFromIdentifier(expr.test, paramName);
    if (!propPath || propPath.length !== 1) {
      return null;
    }
    const jsxProp = propPath[0]!;
    if (jsxProp === "theme") {
      return null;
    }
    const baseArg = buildPropAccessExpr(j, jsxProp);
    const consProp = getMemberPathFromIdentifier(expr.consequent, paramName);
    const altProp = getMemberPathFromIdentifier(expr.alternate, paramName);
    const consIsProp = !!consProp && consProp.length === 1 && consProp[0] === jsxProp;
    const altIsProp = !!altProp && altProp.length === 1 && altProp[0] === jsxProp;
    const consTheme = resolveThemeFromPropsMember({
      expr: expr.consequent,
      paramName,
      filePath,
      parseExpr,
      resolveValue,
      resolverImports,
    });
    const altTheme = resolveThemeFromPropsMember({
      expr: expr.alternate,
      paramName,
      filePath,
      parseExpr,
      resolveValue,
      resolverImports,
    });
    if (consIsProp && altTheme) {
      return {
        jsxProp,
        callArg: j.conditionalExpression(baseArg, baseArg, altTheme),
      };
    }
    if (altIsProp && consTheme) {
      return {
        jsxProp,
        callArg: j.conditionalExpression(baseArg, consTheme, baseArg),
      };
    }
  }
  return null;
}

function resolveThemeFromPropsMember(args: {
  expr: Expression;
  paramName: string;
  filePath: string;
  parseExpr: (exprSource: string) => ExpressionKind | null;
  resolveValue: Adapter["resolveValue"];
  resolverImports: Map<string, ImportSpec>;
}): ExpressionKind | null {
  const { expr, paramName, filePath, parseExpr, resolveValue, resolverImports } = args;
  if (expr.type !== "MemberExpression" && expr.type !== "OptionalMemberExpression") {
    return null;
  }
  const parts = getMemberPathFromIdentifier(expr, paramName);
  if (!parts || parts[0] !== "theme" || parts.length <= 1) {
    return null;
  }
  const themePath = parts.slice(1).join(".");
  const resolved = resolveValue({
    kind: "theme",
    path: themePath,
    filePath,
    loc: getNodeLocStart(expr) ?? undefined,
  });
  if (!resolved) {
    return null;
  }
  for (const imp of resolved.imports ?? []) {
    resolverImports.set(JSON.stringify(imp), imp);
  }
  const exprAst = parseExpr(resolved.expr);
  return exprAst ?? null;
}

function resolveStaticTemplateExpressionAst(args: {
  expr: Expression;
  property: string;
  valueRaw: string;
  filePath: string;
  parseExpr: (exprSource: string) => ExpressionKind | null;
  resolveCall: Adapter["resolveCall"];
  resolveImportInScope: ResolveImportInScope;
  resolverImports: Map<string, ImportSpec>;
  componentInfo: ComponentInfo;
  handlerContext: InternalHandlerContext;
}): ExpressionKind | null {
  const {
    expr,
    property,
    valueRaw,
    filePath,
    parseExpr,
    resolveCall,
    resolveImportInScope,
    resolverImports,
    componentInfo,
    handlerContext,
  } = args;

  const adapterRes = resolveDynamicNode(
    {
      slotId: 0,
      expr,
      css: {
        kind: "declaration",
        selector: "&",
        atRuleStack: [],
        property,
        valueRaw,
      },
      component: componentInfo,
      usage: { jsxUsages: 0, hasPropsSpread: false },
    },
    handlerContext,
  );

  if (adapterRes && adapterRes.type === "resolvedValue") {
    for (const imp of adapterRes.imports ?? []) {
      resolverImports.set(JSON.stringify(imp), imp);
    }
    const exprAst = parseExpr(adapterRes.expr);
    if (exprAst) {
      return exprAst;
    }
  }

  const importedInfo = extractRootAndPath(expr);
  if (importedInfo) {
    const imp = resolveImportInScope(importedInfo.rootName, importedInfo.rootNode);
    if (imp) {
      const res = handlerContext.resolveValue({
        kind: "importedValue",
        importedName: imp.importedName,
        source: imp.source,
        ...(importedInfo.path.length ? { path: importedInfo.path.join(".") } : {}),
        filePath,
      });
      if (res) {
        for (const importSpec of res.imports ?? []) {
          resolverImports.set(JSON.stringify(importSpec), importSpec);
        }
        const exprAst = parseExpr(res.expr);
        if (exprAst) {
          return exprAst;
        }
      }
    }
  }

  if (isCallExpressionNode(expr)) {
    const callee = expr.callee;
    if (isCallExpressionNode(callee)) {
      const innerCall = callee as CallExpressionNode;
      const innerCallee = innerCall.callee;
      const innerCalleeType = (innerCallee as { type?: string }).type;
      const innerCalleeIdent = (innerCallee as { name?: string }).name;
      if (innerCalleeType === "Identifier" && typeof innerCalleeIdent === "string") {
        const imp = resolveImportInScope(innerCalleeIdent, innerCallee);
        if (imp) {
          const innerArgs = (innerCall.arguments ?? []).map((arg) => {
            const staticVal = literalToStaticValue(arg);
            if (staticVal !== null) {
              return { kind: "literal" as const, value: staticVal };
            }
            return { kind: "unknown" as const };
          });
          const callLoc = innerCall.loc?.start;
          // Template literals always need CSS values (not StyleX style references).
          // Reject results that explicitly set kind: "stylexStyles" since StyleX objects
          // cannot be concatenated into CSS strings.
          const callRes = resolveCall({
            callSiteFilePath: filePath,
            calleeImportedName: imp.importedName,
            calleeSource: imp.source,
            args: innerArgs,
            ...(callLoc ? { loc: { line: callLoc.line, column: callLoc.column } } : {}),
          });
          if (callRes && callRes.kind !== "stylexStyles") {
            for (const callImp of callRes.imports ?? []) {
              resolverImports.set(JSON.stringify(callImp), callImp);
            }
            const callExprAst = parseExpr(callRes.expr);
            if (callExprAst) {
              return callExprAst;
            }
          }
        }
      }
    }
  }

  return null;
}

function buildPropAccessExpr(j: JSCodeshift, propName: string): ExpressionKind {
  const isIdent = /^[$A-Z_][0-9A-Z_$]*$/i.test(propName);
  return isIdent
    ? j.identifier(propName)
    : j.memberExpression(j.identifier("props"), j.literal(propName), true);
}

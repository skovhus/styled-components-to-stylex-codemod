import type { API, Expression, JSCodeshift } from "jscodeshift";
import type { Adapter, ImportSource } from "../../adapter.js";
import { resolveDynamicNode, type InternalHandlerContext } from "../builtin-handlers.js";
import { getMemberPathFromIdentifier, getNodeLocStart } from "../utilities/jscodeshift-utils.js";
import type { StyledDecl } from "../transform-types.js";
import type { WarningType } from "../logger.js";
import {
  parseBorderShorthandParts,
  parseInterpolatedBorderStaticParts,
} from "../css-prop-mapping.js";
import { extractStaticParts } from "./interpolations.js";

type ExpressionKind = Parameters<JSCodeshift["expressionStatement"]>[0];

export function tryHandleInterpolatedBorder(args: {
  api: API;
  j: any;
  filePath: string;
  decl: StyledDecl;
  d: any;
  selector: string;
  atRuleStack: string[];
  extraStyleObjects: Map<string, Record<string, unknown>>;
  hasLocalThemeBinding: boolean;
  resolveValue: Adapter["resolveValue"];
  resolveCall: Adapter["resolveCall"];
  importMap: Map<
    string,
    {
      importedName: string;
      source: ImportSource;
    }
  >;
  resolverImports: Map<string, any>;
  parseExpr: (exprSource: string) => ExpressionKind | null;
  applyResolvedPropValue: (prop: string, value: unknown) => void;
  bailUnsupported: (type: WarningType) => void;
  bailUnsupportedWithContext: (
    type: WarningType,
    context?: Record<string, unknown>,
    loc?: { line: number; column: number } | null,
  ) => void;
  toSuffixFromProp: (propName: string) => string;
  variantBuckets: Map<string, Record<string, unknown>>;
  variantStyleKeys: Record<string, string>;
  inlineStyleProps: Array<{ prop: string; expr: any }>;
}): boolean {
  const {
    api,
    j,
    filePath,
    decl,
    d,
    selector,
    atRuleStack,
    extraStyleObjects,
    resolveValue,
    resolveCall,
    importMap,
    resolverImports,
    parseExpr,
    applyResolvedPropValue,
    bailUnsupported,
    bailUnsupportedWithContext,
    toSuffixFromProp,
    variantBuckets,
    variantStyleKeys,
    inlineStyleProps,
  } = args;
  const { hasLocalThemeBinding } = args;

  // Handle border shorthands with interpolated color:
  //   border: 2px solid ${(p) => (p.hasError ? "red" : "#ccc")}
  //   border-right: 1px solid ${(p) => p.theme.borderColor}
  const prop = (d.property ?? "").trim();
  const borderMatch = prop.match(/^border(-top|-right|-bottom|-left)?$/);
  if (!borderMatch) {
    return false;
  }
  // Extract direction suffix (e.g., "Right" from "border-right", or "" from "border")
  const directionRaw = borderMatch[1] ?? "";
  const direction = directionRaw
    ? directionRaw.slice(1).charAt(0).toUpperCase() + directionRaw.slice(2)
    : "";
  if (d.value.kind !== "interpolated") {
    return false;
  }
  if (typeof d.valueRaw !== "string") {
    return false;
  }
  const tokens = d.valueRaw.trim().split(/\s+/).filter(Boolean);
  const slotTok = tokens.find((t: string) => /^__SC_EXPR_(\d+)__$/.test(t));
  if (!slotTok) {
    return false;
  }
  const slotMatch = slotTok.match(/^__SC_EXPR_(\d+)__$/);
  if (!slotMatch || !slotMatch[1]) {
    return false;
  }
  const slotId = Number(slotMatch[1]);

  const { prefix, suffix } = extractStaticParts(d.value, { property: prop });
  const borderParts = parseInterpolatedBorderStaticParts({ prop, prefix, suffix });
  const widthProp = `border${direction}Width`;
  const styleProp = `border${direction}Style`;
  const colorProp = `border${direction}Color`;
  const directionLower = direction ? direction.toLowerCase() : "";
  const staticRaw = `${prefix}${suffix}`.trim();
  let width = borderParts?.width;
  let style = borderParts?.style;
  let color: string | undefined;
  let interpolationTarget: "color" | "width" | "style" = "color";

  if (!borderParts && staticRaw) {
    const parsedStatic = parseBorderShorthandParts(staticRaw);
    if (!parsedStatic || !parsedStatic.color || (!parsedStatic.width && !parsedStatic.style)) {
      return false;
    }
    if (parsedStatic.width && parsedStatic.style) {
      return false;
    }
    width = parsedStatic.width;
    style = parsedStatic.style;
    color = parsedStatic.color;
    interpolationTarget = parsedStatic.width ? "style" : "width";
  }

  if (!borderParts && !staticRaw) {
    // No static parts; keep default assumption that interpolation is the color value.
  }

  if (width) {
    applyResolvedPropValue(widthProp, width);
  }
  if (style) {
    applyResolvedPropValue(styleProp, style);
  }
  if (color) {
    applyResolvedPropValue(colorProp, color);
  }
  const hasStaticWidthOrStyle = Boolean(width || style);
  const targetProp =
    interpolationTarget === "color"
      ? colorProp
      : interpolationTarget === "width"
        ? widthProp
        : styleProp;
  const targetCssProperty =
    interpolationTarget === "width"
      ? directionLower
        ? `border-${directionLower}-width`
        : "border-width"
      : interpolationTarget === "style"
        ? directionLower
          ? `border-${directionLower}-style`
          : "border-style"
        : directionLower
          ? `border-${directionLower}-color`
          : "border-color";

  // Now treat the interpolated portion as the resolved target property.
  const expr = (decl as any).templateExpressions[slotId] as any;

  // Helper to parse a border shorthand string and return expanded properties
  // Uses direction-aware property names (widthProp, styleProp, colorProp)
  const parseBorderShorthand = (value: string): Record<string, string> | null => {
    const parsed = parseBorderShorthandParts(value);
    if (!parsed) {
      return null;
    }
    const { width: bWidth, style: bStyle, color: bColor } = parsed;
    if (bWidth || bStyle) {
      const result: Record<string, string> = {};
      if (bWidth) {
        result[widthProp] = bWidth;
      }
      if (bStyle) {
        result[styleProp] = bStyle;
      }
      if (bColor) {
        result[colorProp] = bColor;
      }
      return result;
    }
    if (bColor) {
      return { [colorProp]: bColor };
    }
    return null;
  };

  // Helper to check if parsed result has width or style (is a full shorthand)
  const isFullShorthand = (parsed: Record<string, string> | null): boolean =>
    parsed !== null && (widthProp in parsed || styleProp in parsed);

  if (expr?.type === "ArrowFunctionExpression" && expr.body?.type === "ConditionalExpression") {
    const test = expr.body.test as any;
    const cons = expr.body.consequent as any;
    const alt = expr.body.alternate as any;
    if (
      test?.type === "MemberExpression" &&
      test.property?.type === "Identifier" &&
      cons?.type === "StringLiteral" &&
      alt?.type === "StringLiteral"
    ) {
      const altParsed = parseBorderShorthand(alt.value);
      const consParsed = parseBorderShorthand(cons.value);
      const when = test.property.name;
      const notWhen = `!${when}`;

      // Check if either value is a full border shorthand (has width or style)
      const hasFullShorthand = isFullShorthand(altParsed) || isFullShorthand(consParsed);

      if (hasFullShorthand) {
        // Both branches should become variants (neither goes to base style)
        if (altParsed) {
          variantBuckets.set(notWhen, {
            ...variantBuckets.get(notWhen),
            ...altParsed,
          });
          variantStyleKeys[notWhen] ??= `${decl.styleKey}${toSuffixFromProp(notWhen)}`;
        }
        if (consParsed) {
          variantBuckets.set(when, {
            ...variantBuckets.get(when),
            ...consParsed,
          });
          variantStyleKeys[when] ??= `${decl.styleKey}${toSuffixFromProp(when)}`;
        }
      } else {
        // Original behavior: default to alternate, conditionally apply consequent
        if (altParsed?.[colorProp]) {
          applyResolvedPropValue(colorProp, altParsed[colorProp]);
        }
        if (consParsed?.[colorProp]) {
          variantBuckets.set(when, {
            ...variantBuckets.get(when),
            [colorProp]: consParsed[colorProp],
          });
          variantStyleKeys[when] ??= `${decl.styleKey}${toSuffixFromProp(when)}`;
        }
      }
      return true;
    }
  }

  if (expr?.type === "ArrowFunctionExpression" && expr.body?.type === "ConditionalExpression") {
    const cons = expr.body.consequent as any;
    const alt = expr.body.alternate as any;
    const isMemberExpr = (n: any): boolean =>
      n?.type === "MemberExpression" || n?.type === "OptionalMemberExpression";
    if (isMemberExpr(cons) || isMemberExpr(alt)) {
      // Defer to the dynamic resolver by treating this as the target border interpolation.
      d.property = targetCssProperty;
      return false;
    }
  }

  // Handle call expressions (like helper functions) by resolving via resolveDynamicNode:
  //   border: 1px solid ${color("bgSub")}
  {
    const callExpr =
      expr?.type === "CallExpression"
        ? expr
        : expr?.type === "ArrowFunctionExpression" && expr.body?.type === "CallExpression"
          ? expr.body
          : null;
    const callIdent = callExpr?.callee?.type === "Identifier" ? callExpr.callee.name : null;
    const callIsImported = callIdent ? importMap.has(callIdent) : false;
    const unresolvedCallWarning: WarningType = callIsImported
      ? "Adapter helper call in border interpolation did not resolve to a single CSS value"
      : "Unsupported call expression (expected imported helper(...) or imported helper(...)(...))";

    type ResolveBorderExprResult =
      | { kind: "okValue"; exprAst: any; imports: any[] }
      | { kind: "okStyles"; exprAst: any; imports: any[] }
      | {
          kind: "warn";
          warning: WarningType;
          context?: Record<string, unknown>;
          loc?: { line: number; column: number } | null | undefined;
        };

    const resolveBorderExpr = (node: any): ResolveBorderExprResult => {
      const loc = getNodeLocStart(node);
      const res = resolveDynamicNode(
        {
          slotId,
          expr: node,
          css: {
            kind: "declaration",
            selector: "&",
            atRuleStack: [],
            // Pass original CSS property (e.g., "border-left") rather than expanded property
            // (e.g., "borderLeftColor") so adapters can detect directional borders and return
            // appropriate CSS values vs StyleX style objects
            property: prop,
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
          resolveCall,
          resolveImport: (localName: string, _identNode?: unknown) => {
            const v = importMap.get(localName);
            return v ? v : null;
          },
        } satisfies InternalHandlerContext,
      );
      if (!res) {
        return { kind: "warn", warning: unresolvedCallWarning };
      }
      if (res.type === "resolvedValue") {
        const exprAst = parseExpr(res.expr);
        if (!exprAst) {
          const context =
            res.resolveCallContext && res.resolveCallResult
              ? {
                  resolveCallContext: res.resolveCallContext,
                  resolveCallResult: res.resolveCallResult,
                }
              : undefined;
          return {
            kind: "warn",
            warning: "Adapter resolveCall returned an unparseable value expression",
            context,
          };
        }
        return { kind: "okValue", exprAst, imports: res.imports ?? [] };
      }
      if (res.type === "resolvedStyles") {
        const exprAst = parseExpr(res.expr);
        if (!exprAst) {
          const context =
            res.resolveCallContext && res.resolveCallResult
              ? {
                  resolveCallContext: res.resolveCallContext,
                  resolveCallResult: res.resolveCallResult,
                }
              : undefined;
          return {
            kind: "warn",
            warning: "Adapter resolveCall returned an unparseable styles expression",
            context,
            loc,
          };
        }
        return {
          kind: "okStyles",
          exprAst,
          imports: res.imports ?? [],
        };
      }
      if (res.type === "keepOriginal") {
        return { kind: "warn", warning: res.reason };
      }
      return { kind: "warn", warning: unresolvedCallWarning };
    };

    const parseTemplateLiteralBorderShorthand = (
      value: any,
    ): {
      width?: unknown; // string for static width, AST node for dynamic
      style?: string;
      colorExpr: unknown;
    } | null => {
      if (!value || value.type !== "TemplateLiteral") {
        return null;
      }
      const quasis = value.quasis ?? [];
      const exprs = value.expressions ?? [];

      // Format 1: `1px solid ${color}` - static width/style, dynamic color
      // quasis: ["1px solid ", ""], exprs: [colorExpr]
      if (quasis.length === 2 && exprs.length === 1) {
        const prefix = quasis[0]?.value?.cooked ?? quasis[0]?.value?.raw ?? "";
        const suffix = quasis[1]?.value?.cooked ?? quasis[1]?.value?.raw ?? "";
        if (suffix.trim() !== "") {
          return null;
        }
        const parsed = parseInterpolatedBorderStaticParts({ prop, prefix, suffix });
        if (!parsed?.width || !parsed?.style) {
          return null;
        }
        return { width: parsed.width, style: parsed.style, colorExpr: exprs[0] };
      }

      // Format 2: `${width} solid ${color}` - dynamic width, static style, dynamic color
      // quasis: ["", " solid ", ""], exprs: [widthExpr, colorExpr]
      if (quasis.length === 3 && exprs.length === 2) {
        const prefix = quasis[0]?.value?.cooked ?? quasis[0]?.value?.raw ?? "";
        const middle = quasis[1]?.value?.cooked ?? quasis[1]?.value?.raw ?? "";
        const suffix = quasis[2]?.value?.cooked ?? quasis[2]?.value?.raw ?? "";
        // First quasi should be empty (width is the first expression)
        if (prefix.trim() !== "") {
          return null;
        }
        // Last quasi should be empty (color is the last expression)
        if (suffix.trim() !== "") {
          return null;
        }
        // Middle quasi should contain only the border style (e.g., " solid ")
        const middleTrimmed = middle.trim();
        const validStyles = [
          "solid",
          "dashed",
          "dotted",
          "double",
          "groove",
          "ridge",
          "inset",
          "outset",
          "none",
          "hidden",
        ];
        if (!validStyles.includes(middleTrimmed)) {
          return null;
        }
        return { width: exprs[0], style: middleTrimmed, colorExpr: exprs[1] };
      }

      return null;
    };

    const bumpResolverImportToEnd = (predicate: (spec: unknown) => boolean): void => {
      let bump: { k: string; v: unknown } | null = null;
      for (const [k, v] of resolverImports.entries()) {
        if (predicate(v)) {
          bump = { k, v };
          break;
        }
      }
      if (bump) {
        resolverImports.delete(bump.k);
        resolverImports.set(bump.k, bump.v);
      }
    };

    // Support helper calls:
    // - direct: ${borderByColor(themeVar)}
    // - wrapped in arrow fn: ${(p) => borderByColor(p.theme.color.bgSub)}
    const isResolvableHelper =
      expr?.type === "CallExpression" ||
      (expr?.type === "ArrowFunctionExpression" && expr.body?.type === "CallExpression");
    if (isResolvableHelper) {
      const resolved = resolveBorderExpr(expr);
      if (resolved.kind === "warn") {
        if (resolved.context) {
          bailUnsupportedWithContext(resolved.warning, resolved.context, resolved.loc);
        } else {
          bailUnsupported(resolved.warning);
        }
        return true;
      }

      for (const imp of resolved.imports) {
        resolverImports.set(JSON.stringify(imp), imp);
      }

      if (resolved.kind === "okStyles") {
        if (directionRaw) {
          bailUnsupportedWithContext(
            "Directional border helper styles are not supported",
            { property: prop },
            getNodeLocStart(expr),
          );
          return true;
        }
        if (selector.trim() !== "&" || (atRuleStack ?? []).length > 0) {
          bailUnsupportedWithContext(
            "Adapter resolved StyleX styles cannot be applied under nested selectors/at-rules",
            { selector, atRuleStack },
            getNodeLocStart(expr),
          );
          return true;
        }
        decl.extraStylexPropsArgs ??= [];
        decl.extraStylexPropsArgs.push({
          expr: resolved.exprAst as any,
        });
        decl.needsWrapperComponent = true;
        return true;
      }

      // Special case: helper returns a border shorthand string (or template literal),
      // and this interpolation had no static width/style tokens. Reuse the same
      // expansion approach as css-helper-reuse: emit width/style/color separately.
      if (!hasStaticWidthOrStyle) {
        const parsedTpl = parseTemplateLiteralBorderShorthand(resolved.exprAst);
        if (parsedTpl) {
          const fullProp = direction ? `border${direction}` : "border";
          const extraKey = fullProp;
          const bucket = extraStyleObjects.get(extraKey) ?? {};
          if (parsedTpl.width) {
            (bucket as any)[widthProp] = parsedTpl.width;
          }
          if (parsedTpl.style) {
            (bucket as any)[styleProp] = parsedTpl.style;
          }
          (bucket as any)[colorProp] = parsedTpl.colorExpr;
          extraStyleObjects.set(extraKey, bucket);

          decl.extraStylexPropsArgs ??= [];
          decl.extraStylexPropsArgs.push({
            expr: j.memberExpression(j.identifier("styles"), j.identifier(extraKey)),
          });
          // `extraStylexPropsArgs` are only emitted for wrapper components.
          // If this styled component would otherwise be eligible for inlining, we'd drop the extra
          // `styles.<extraKey>` argument and lose the border expansion. Force a wrapper to preserve
          // semantics.
          decl.needsWrapperComponent = true;

          // Import insertion currently always happens right after the stylex import, which means
          // later inserts appear above earlier inserts. For this pattern, we want helper imports
          // (e.g. `borders`) to appear above theme token imports (e.g. `$colors`), matching
          // existing fixture conventions.
          bumpResolverImportToEnd((spec) => {
            const from = (spec as any)?.from;
            const names = (spec as any)?.names;
            return (
              from?.kind === "specifier" &&
              from.value === "./lib/helpers.stylex" &&
              Array.isArray(names) &&
              names.some((n: any) => n?.imported === "borders")
            );
          });
          return true;
        }
      }

      // Existing behavior: treat as border color expression (or full border value if width/style absent).
      const exprNode = resolved.exprAst as { type?: string; value?: unknown };
      if (exprNode.type === "StringLiteral" || exprNode.type === "Literal") {
        const raw = typeof exprNode.value === "string" ? exprNode.value : null;
        if (raw) {
          const parsed = parseBorderShorthand(raw);
          if (parsed) {
            for (const [prop, value] of Object.entries(parsed)) {
              applyResolvedPropValue(prop, value);
            }
            return true;
          }
        }
      }
      if (hasStaticWidthOrStyle) {
        applyResolvedPropValue(targetProp, resolved.exprAst);
      } else {
        const fullProp = direction ? `border${direction}` : "border";
        applyResolvedPropValue(fullProp, resolved.exprAst);
      }
      return true;
    }
  }

  // Handle arrow functions that are simple member expressions (like theme access):
  //   border: 1px solid ${(props) => props.theme.color.primary}
  //   border-right: 1px solid ${(props) => props.theme.borderColor}
  // In this case, we modify the declaration's property to be the target property so that
  // the generic dynamic handler (resolveDynamicNode) outputs the correct property.
  if (expr?.type === "ArrowFunctionExpression") {
    const body = expr.body as any;
    // Simple arrow function returning a member expression: (p) => p.theme.color.X
    if (body?.type === "MemberExpression") {
      // Mutate the declaration's property so fallback handlers use the target property
      d.property = targetCssProperty;
      return false; // Let the generic handler resolve the theme value
    }
  }

  // Simple expression (identifier/template literal) → target border property value
  if (expr && expr.type !== "ArrowFunctionExpression") {
    if (expr.type === "MemberExpression") {
      if (hasLocalThemeBinding) {
        applyResolvedPropValue(
          targetProp,
          j.templateLiteral(
            [
              j.templateElement({ raw: "", cooked: "" }, false),
              j.templateElement({ raw: "", cooked: "" }, true),
            ],
            [expr as any],
          ) as any,
        );
        return true;
      }
      const parts = getMemberPathFromIdentifier(expr as Expression, "theme");
      if (parts && parts.length > 0) {
        const resolved = resolveValue({
          kind: "theme",
          path: parts.join("."),
          filePath,
          loc: getNodeLocStart(expr) ?? undefined,
        });
        if (resolved) {
          for (const imp of resolved.imports ?? []) {
            resolverImports.set(JSON.stringify(imp), imp);
          }
          const exprAst = parseExpr(resolved.expr);
          if (exprAst) {
            applyResolvedPropValue(targetProp, exprAst as any);
            return true;
          }
        }
      }
    }
    applyResolvedPropValue(targetProp, expr as any);
    return true;
  }

  // fallback to inline style via wrapper
  if (decl.shouldForwardProp) {
    inlineStyleProps.push({
      prop: targetProp,
      expr:
        expr?.type === "ArrowFunctionExpression"
          ? j.callExpression(expr, [j.identifier("props")])
          : expr,
    });
    return true;
  }
  return false;
}

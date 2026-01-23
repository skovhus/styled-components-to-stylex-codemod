import type { API, Expression, JSCodeshift } from "jscodeshift";
import type { Adapter, ImportSource } from "../../adapter.js";
import { resolveDynamicNode, type InternalHandlerContext } from "../builtin-handlers.js";
import { getMemberPathFromIdentifier, getNodeLocStart } from "../jscodeshift-utils.js";
import type { StyledDecl } from "../transform-types.js";

type ExpressionKind = Parameters<JSCodeshift["expressionStatement"]>[0];

export function tryHandleInterpolatedBorder(args: {
  api: API;
  j: any;
  filePath: string;
  decl: StyledDecl;
  d: any;
  styleObj: Record<string, unknown>;
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
    styleObj,
    resolveValue,
    resolveCall,
    importMap,
    resolverImports,
    parseExpr,
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
  const widthProp = `border${direction}Width`;
  const styleProp = `border${direction}Style`;
  const colorProp = `border${direction}Color`;
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
  const slotId = Number(slotTok.match(/^__SC_EXPR_(\d+)__$/)![1]);

  const borderStyles = new Set([
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
  let width: string | undefined;
  let style: string | undefined;
  for (const t of tokens) {
    if (/^__SC_EXPR_\d+__$/.test(t)) {
      continue;
    }
    if (!width && /^-?\d*\.?\d+(px|rem|em|vh|vw|vmin|vmax|%)?$/.test(t)) {
      width = t;
      continue;
    }
    if (!style && borderStyles.has(t)) {
      style = t;
      continue;
    }
  }
  if (width) {
    (styleObj as any)[widthProp] = width;
  }
  if (style) {
    (styleObj as any)[styleProp] = style;
  }
  const hasStaticWidthOrStyle = Boolean(width || style);

  // Now treat the interpolated portion as the border color.
  const expr = (decl as any).templateExpressions[slotId] as any;

  // Helper to parse a border shorthand string and return expanded properties
  // Uses direction-aware property names (widthProp, styleProp, colorProp)
  const parseBorderShorthand = (value: string): Record<string, string> | null => {
    const tokens = value.trim().split(/\s+/);
    const borderStylesSet = new Set([
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
    const looksLikeLengthLocal = (t: string) =>
      /^-?\d*\.?\d+(px|rem|em|vh|vw|vmin|vmax|%)?$/.test(t);

    let bWidth: string | undefined;
    let bStyle: string | undefined;
    const colorParts: string[] = [];
    for (const token of tokens) {
      if (!bWidth && looksLikeLengthLocal(token)) {
        bWidth = token;
      } else if (!bStyle && borderStylesSet.has(token)) {
        bStyle = token;
      } else {
        colorParts.push(token);
      }
    }
    const bColor = colorParts.join(" ").trim();
    // If we found at least width or style, this is a border shorthand
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
    // Just a color value
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
          (styleObj as any)[colorProp] = altParsed[colorProp];
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
      // Defer to the dynamic resolver by treating this as a border-color interpolation.
      d.property = direction ? `border-${direction.toLowerCase()}-color` : "border-color";
      return false;
    }
  }

  // Handle call expressions (like helper functions) by resolving via resolveDynamicNode:
  //   border: 1px solid ${color("bgSub")}
  if (expr?.type === "CallExpression") {
    const loc = getNodeLocStart(expr);
    const res = resolveDynamicNode(
      {
        slotId,
        expr,
        css: {
          kind: "declaration",
          selector: "&",
          atRuleStack: [],
          property: colorProp,
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
        resolveImport: (localName: string) => {
          const v = importMap.get(localName);
          return v ? v : null;
        },
      } satisfies InternalHandlerContext,
    );
    if (res && res.type === "resolvedValue") {
      for (const imp of res.imports ?? []) {
        resolverImports.set(JSON.stringify(imp), imp);
      }
      const exprAst = parseExpr(res.expr);
      if (exprAst) {
        const exprNode = exprAst as { type?: string; value?: unknown };
        if (exprNode.type === "StringLiteral" || exprNode.type === "Literal") {
          const raw = typeof exprNode.value === "string" ? exprNode.value : null;
          if (raw) {
            const parsed = parseBorderShorthand(raw);
            if (parsed) {
              Object.assign(styleObj, parsed);
              return true;
            }
          }
        }
        if (hasStaticWidthOrStyle) {
          styleObj[colorProp] = exprAst;
        } else {
          const fullProp = direction ? `border${direction}` : "border";
          styleObj[fullProp] = exprAst;
        }
        return true;
      }
    }
    // If resolution failed, fall through to other handlers
  }

  // Handle arrow functions that are simple member expressions (like theme access):
  //   border: 1px solid ${(props) => props.theme.color.primary}
  //   border-right: 1px solid ${(props) => props.theme.borderColor}
  // In this case, we modify the declaration's property to be the color property so that
  // the generic dynamic handler (resolveDynamicNode) outputs the correct property.
  if (expr?.type === "ArrowFunctionExpression") {
    const body = expr.body as any;
    // Simple arrow function returning a member expression: (p) => p.theme.color.X
    if (body?.type === "MemberExpression") {
      // Mutate the declaration's property so fallback handlers use the color property
      // e.g., "border" → "border-color", "border-right" → "border-right-color"
      d.property = direction ? `border-${direction.toLowerCase()}-color` : "border-color";
      return false; // Let the generic handler resolve the theme value
    }
  }

  // Simple color expression (identifier/template literal) → border color expr
  if (expr && expr.type !== "ArrowFunctionExpression") {
    if (expr.type === "MemberExpression") {
      if (hasLocalThemeBinding) {
        (styleObj as any)[colorProp] = j.templateLiteral(
          [
            j.templateElement({ raw: "", cooked: "" }, false),
            j.templateElement({ raw: "", cooked: "" }, true),
          ],
          [expr as any],
        ) as any;
        return true;
      }
      const parts = getMemberPathFromIdentifier(expr as Expression, "theme");
      if (parts && parts.length > 0) {
        const resolved = resolveValue({ kind: "theme", path: parts.join("."), filePath });
        if (resolved) {
          for (const imp of resolved.imports ?? []) {
            resolverImports.set(JSON.stringify(imp), imp);
          }
          const exprAst = parseExpr(resolved.expr);
          if (exprAst) {
            (styleObj as any)[colorProp] = exprAst as any;
            return true;
          }
        }
      }
    }
    (styleObj as any)[colorProp] = expr as any;
    return true;
  }

  // fallback to inline style via wrapper
  if (decl.shouldForwardProp) {
    inlineStyleProps.push({
      prop: colorProp,
      expr:
        expr?.type === "ArrowFunctionExpression"
          ? j.callExpression(expr, [j.identifier("props")])
          : expr,
    });
    return true;
  }
  return false;
}

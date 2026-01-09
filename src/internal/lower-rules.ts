import type { API } from "jscodeshift";
import { resolveDynamicNode } from "./builtin-handlers.js";
import { cssDeclarationToStylexDeclarations, cssPropertyToStylexProp } from "./css-prop-mapping.js";
import { getMemberPathFromIdentifier, getNodeLocStart } from "./jscodeshift-utils.js";
import type { ImportSource } from "../adapter.js";
import {
  normalizeSelectorForInputAttributePseudos,
  parseAttributeSelector,
  parsePseudoElement,
  parseSimplePseudo,
} from "./selectors.js";
import type { StyledDecl, TransformWarning } from "./transform-types.js";

export type DescendantOverride = {
  parentStyleKey: string;
  childStyleKey: string;
  overrideStyleKey: string;
};

export function lowerRules(args: {
  api: API;
  j: any;
  root: any;
  filePath: string;
  resolveValue: (ctx: any) => any;
  importMap: Map<
    string,
    {
      importedName: string;
      source: ImportSource;
    }
  >;
  warnings: TransformWarning[];
  resolverImports: Map<string, any>;
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
  parseExpr: (exprSource: string) => unknown;
  cssValueToJs: (value: any, important?: boolean) => unknown;
  rewriteCssVarsInStyleObject: (
    obj: Record<string, unknown>,
    definedVars: Map<string, string>,
    varsToDrop: Set<string>,
  ) => void;
  literalToAst: (j: any, v: unknown) => any;
}): {
  resolvedStyleObjects: Map<string, any>;
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

  const resolvedStyleObjects = new Map<string, any>();
  const declByLocalName = new Map(styledDecls.map((d) => [d.localName, d]));
  const descendantOverrides: DescendantOverride[] = [];
  const ancestorSelectorParents = new Set<string>();
  const descendantOverrideBase = new Map<string, Record<string, unknown>>();
  const descendantOverrideHover = new Map<string, Record<string, unknown>>();
  let bail = false;

  const ensureShouldForwardPropDrop = (decl: StyledDecl, propName: string) => {
    // Ensure we generate a wrapper so we can consume the styling prop without forwarding it to DOM.
    decl.needsWrapperComponent = true;
    const existing = decl.shouldForwardProp ?? { dropProps: [] as string[] };
    const dropProps = new Set<string>(existing.dropProps ?? []);
    dropProps.add(propName);
    decl.shouldForwardProp = { ...existing, dropProps: [...dropProps] };
  };

  const literalToStaticValue = (node: any): string | number | null => {
    if (!node || typeof node !== "object") {
      return null;
    }
    if (node.type === "StringLiteral") {
      return node.value;
    }
    if (node.type === "NumericLiteral") {
      return node.value;
    }
    // Support recast "Literal" nodes when parser produces them.
    if (
      node.type === "Literal" &&
      (typeof node.value === "string" || typeof node.value === "number")
    ) {
      return node.value;
    }
    return null;
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
    const inlineStyleProps: Array<{ prop: string; expr: any }> = [];
    const localVarValues = new Map<string, string>();

    // Best-effort inference for prop types from TS type annotations, supporting:
    //   1. Inline type literals: styled.div<{ $width: number; color?: string }>
    //   2. Type references: styled.span<TextColorProps> (looks up the interface)
    // We only need enough to choose a better param type for emitted style functions.
    const findJsxPropTsType = (jsxProp: string): unknown => {
      const pt: any = (decl as any).propsType;
      if (!pt) {
        return null;
      }

      // Helper to find prop type in a type literal (interface body)
      const findInTypeLiteral = (typeLiteral: any): unknown => {
        for (const m of typeLiteral.members ?? typeLiteral.body ?? []) {
          if (!m || m.type !== "TSPropertySignature") {
            continue;
          }
          const k: any = m.key;
          const name =
            k?.type === "Identifier"
              ? k.name
              : k?.type === "StringLiteral"
                ? k.value
                : k?.type === "Literal" && typeof k.value === "string"
                  ? k.value
                  : null;
          if (name !== jsxProp) {
            continue;
          }
          return m.typeAnnotation?.typeAnnotation ?? null;
        }
        return null;
      };

      // Case 1: Inline type literal - styled.div<{ color: string }>
      if (pt.type === "TSTypeLiteral") {
        return findInTypeLiteral(pt);
      }

      // Case 2: Type reference - styled.span<TextColorProps>
      // Look up the interface definition in the file
      if (pt.type === "TSTypeReference") {
        const typeName = pt.typeName?.name;
        if (typeName && typeof typeName === "string") {
          // Find the interface with this name
          const interfaces = root.find(j.TSInterfaceDeclaration, {
            id: { type: "Identifier", name: typeName },
          } as any);
          if (interfaces.size() > 0) {
            const iface = interfaces.get(0).node;
            return findInTypeLiteral(iface.body);
          }
        }
      }

      return null;
    };
    const annotateParamFromJsxProp = (paramId: any, jsxProp: string): void => {
      const t = findJsxPropTsType(jsxProp);
      if (t && typeof t === "object") {
        const typeType = (t as any).type;
        // Special-case numeric props (matches the `$width: number` ask).
        if (typeType === "TSNumberKeyword") {
          (paramId as any).typeAnnotation = j.tsTypeAnnotation(j.tsNumberKeyword());
          return;
        }
        // Preserve type references (e.g., `Colors` from `color: Colors`)
        // This ensures imported types are preserved in the style function signature
        if (
          typeType === "TSTypeReference" ||
          typeType === "TSUnionType" ||
          typeType === "TSLiteralType"
        ) {
          (paramId as any).typeAnnotation = j.tsTypeAnnotation(t);
          return;
        }
      }
      (paramId as any).typeAnnotation = j.tsTypeAnnotation(j.tsStringKeyword());
    };

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

    const getKeyframeFromSlot = (slotId: number): string | null => {
      const expr = decl.templateExpressions[slotId] as any;
      if (expr?.type === "Identifier" && keyframesNames.has(expr.name)) {
        return expr.name;
      }
      return null;
    };

    const splitTopLevelCommas = (s: string): string[] => {
      const out: string[] = [];
      let buf = "";
      let depth = 0;
      for (let i = 0; i < s.length; i++) {
        const ch = s[i]!;
        if (ch === "(") {
          depth++;
        }
        if (ch === ")") {
          depth = Math.max(0, depth - 1);
        }
        if (ch === "," && depth === 0) {
          out.push(buf);
          buf = "";
          continue;
        }
        buf += ch;
      }
      out.push(buf);
      return out.map((x) => x.trim()).filter(Boolean);
    };

    const buildCommaTemplate = (
      names: Array<{ kind: "ident"; name: string } | { kind: "text"; value: string }>,
    ) => {
      // Prefer template literal for identifier keyframes: `${a}, ${b}`
      const exprs: any[] = [];
      const quasis: any[] = [];
      let q = "";
      for (let i = 0; i < names.length; i++) {
        const n = names[i]!;
        if (i > 0) {
          q += ", ";
        }
        if (n.kind === "ident") {
          quasis.push(j.templateElement({ raw: q, cooked: q }, false));
          exprs.push(j.identifier(n.name));
          q = "";
        } else {
          q += n.value;
        }
      }
      quasis.push(j.templateElement({ raw: q, cooked: q }, true));
      return j.templateLiteral(quasis, exprs);
    };

    const tryHandleAnimation = (d: any): boolean => {
      // Handle keyframes-based animation declarations before handler pipeline.
      if (!keyframesNames.size) {
        return false;
      }
      const prop = (d.property ?? "").trim();
      if (!prop) {
        return false;
      }

      const stylexProp = cssDeclarationToStylexDeclarations(d)[0]?.prop;
      if (!stylexProp) {
        return false;
      }

      // animation-name: ${kf}
      if (stylexProp === "animationName" && d.value.kind === "interpolated") {
        const slot = d.value.parts.find((p: any) => p.kind === "slot");
        if (!slot) {
          return false;
        }
        const kf = getKeyframeFromSlot(slot.slotId);
        if (!kf) {
          return false;
        }
        styleObj.animationName = j.identifier(kf) as any;
        return true;
      }

      // animation: ${kf} 2s linear infinite; or with commas
      if (prop === "animation" && typeof d.valueRaw === "string") {
        const segments = splitTopLevelCommas(d.valueRaw);
        if (!segments.length) {
          return false;
        }

        const animNames: Array<{ kind: "ident"; name: string } | { kind: "text"; value: string }> =
          [];
        const durations: string[] = [];
        const timings: string[] = [];
        const delays: string[] = [];
        const iterations: string[] = [];

        for (const seg of segments) {
          const tokens = seg.split(/\s+/).filter(Boolean);
          if (!tokens.length) {
            return false;
          }

          const nameTok = tokens.shift()!;
          const m = nameTok.match(/^__SC_EXPR_(\d+)__$/);
          if (!m) {
            return false;
          }
          const kf = getKeyframeFromSlot(Number(m[1]));
          if (!kf) {
            return false;
          }
          animNames.push({ kind: "ident", name: kf });

          // Remaining tokens
          const timeTokens = tokens.filter((t) => /^(?:\d+|\d*\.\d+)(ms|s)$/.test(t));
          if (timeTokens[0]) {
            durations.push(timeTokens[0]);
          }
          if (timeTokens[1]) {
            delays.push(timeTokens[1]);
          }

          const timing = tokens.find(
            (t) =>
              t === "linear" ||
              t === "ease" ||
              t === "ease-in" ||
              t === "ease-out" ||
              t === "ease-in-out" ||
              t.startsWith("cubic-bezier(") ||
              t.startsWith("steps("),
          );
          if (timing) {
            timings.push(timing);
          }

          const iter = tokens.find((t) => t === "infinite" || /^\d+$/.test(t));
          if (iter) {
            iterations.push(iter);
          }
        }

        if (animNames.length === 1 && animNames[0]!.kind === "ident") {
          styleObj.animationName = j.identifier(animNames[0]!.name) as any;
        } else {
          styleObj.animationName = buildCommaTemplate(animNames) as any;
        }
        if (durations.length) {
          styleObj.animationDuration = durations.join(", ");
        }
        if (timings.length) {
          styleObj.animationTimingFunction = timings.join(", ");
        }
        if (delays.length) {
          styleObj.animationDelay = delays.join(", ");
        }
        if (iterations.length) {
          styleObj.animationIterationCount = iterations.join(", ");
        }
        return true;
      }

      return false;
    };

    const buildInterpolatedTemplate = (cssValue: any): unknown => {
      // Build a JS TemplateLiteral from CssValue parts when it’s basically string interpolation,
      // e.g. `${spacing}px`, `${spacing / 2}px 0`, `1px solid ${theme.colors.secondary}` (handled elsewhere).
      if (!cssValue || cssValue.kind !== "interpolated") {
        return null;
      }
      const parts = cssValue.parts ?? [];
      const exprs: any[] = [];
      const quasis: any[] = [];
      let q = "";
      for (const part of parts) {
        if (part.kind === "static") {
          q += part.value;
          continue;
        }
        if (part.kind === "slot") {
          quasis.push(j.templateElement({ raw: q, cooked: q }, false));
          q = "";
          const expr = decl.templateExpressions[part.slotId] as any;
          // Only inline non-function expressions.
          if (!expr || expr.type === "ArrowFunctionExpression") {
            return null;
          }
          exprs.push(expr);
          continue;
        }
      }
      quasis.push(j.templateElement({ raw: q, cooked: q }, true));
      return j.templateLiteral(quasis, exprs);
    };

    const tryHandleInterpolatedStringValue = (d: any): boolean => {
      // Handle common “string interpolation” cases:
      //  - background: ${dynamicColor}
      //  - padding: ${spacing}px
      //  - font-size: ${fontSize}px
      //  - line-height: ${lineHeight}
      if (d.value.kind !== "interpolated") {
        return false;
      }
      if (!d.property) {
        return false;
      }

      // Special-case: margin shorthand `${expr}px 0` → marginTop/Right/Bottom/Left
      if ((d.property ?? "").trim() === "margin" && typeof d.valueRaw === "string") {
        const m = d.valueRaw.trim().match(/^__SC_EXPR_(\d+)__(px)?\s+0$/);
        if (m) {
          const slotId = Number(m[1]);
          const expr = decl.templateExpressions[slotId] as any;
          if (!expr || expr.type === "ArrowFunctionExpression") {
            return false;
          }
          const unit = m[2] ?? "";
          const tl = j.templateLiteral(
            [
              j.templateElement({ raw: "", cooked: "" }, false),
              j.templateElement({ raw: `${unit}`, cooked: `${unit}` }, true),
            ],
            [expr],
          );
          styleObj.marginTop = tl as any;
          styleObj.marginRight = 0;
          styleObj.marginBottom = tl as any;
          styleObj.marginLeft = 0;
          return true;
        }
      }

      // If it’s a single-slot (possibly with static around it), emit a TemplateLiteral.
      // But if it's exactly one slot and no static, emit the expression directly (keeps numbers/conditionals as-is).
      const partsOnly = d.value.parts ?? [];
      if (partsOnly.length === 1 && partsOnly[0]?.kind === "slot") {
        const expr = decl.templateExpressions[partsOnly[0].slotId] as any;
        if (!expr || expr.type === "ArrowFunctionExpression") {
          return false;
        }
        // Give the dynamic resolution pipeline a chance to resolve call-expressions (e.g. helper lookups).
        if (expr.type === "CallExpression") {
          return false;
        }
        for (const out of cssDeclarationToStylexDeclarations(d)) {
          styleObj[out.prop] = expr as any;
        }
        return true;
      }

      const tl = buildInterpolatedTemplate(d.value);
      if (!tl) {
        return false;
      }

      for (const out of cssDeclarationToStylexDeclarations(d)) {
        styleObj[out.prop] = tl as any;
      }
      return true;
    };

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

    const tryHandleInterpolatedBorder = (d: any): boolean => {
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
        styleObj[widthProp] = width;
      }
      if (style) {
        styleObj[styleProp] = style;
      }

      // Now treat the interpolated portion as the border color.
      const expr = decl.templateExpressions[slotId] as any;

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
              styleObj[colorProp] = altParsed[colorProp];
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

      // Simple color expression (identifier/member expression/template literal) → border color expr
      if (expr && expr.type !== "ArrowFunctionExpression") {
        styleObj[colorProp] = expr as any;
        return true;
      }

      // Handle arrow functions that are simple member expressions (like theme access):
      //   border: 1px solid ${(props) => props.theme.colors.primary}
      //   border-right: 1px solid ${(props) => props.theme.borderColor}
      // In this case, we modify the declaration's property to be the color property so that
      // the generic dynamic handler (resolveDynamicNode) outputs the correct property.
      if (expr?.type === "ArrowFunctionExpression") {
        const body = expr.body as any;
        // Simple arrow function returning a member expression: (p) => p.theme.colors.X
        if (body?.type === "MemberExpression") {
          // Mutate the declaration's property so fallback handlers use the color property
          // e.g., "border" → "border-color", "border-right" → "border-right-color"
          d.property = direction ? `border-${direction.toLowerCase()}-color` : "border-color";
          return false; // Let the generic handler resolve the theme value
        }
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

      const pseudo = parseSimplePseudo(selector);
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
          if (tryHandleAnimation(d)) {
            continue;
          }
          if (tryHandleInterpolatedBorder(d)) {
            continue;
          }
          if (tryHandleInterpolatedStringValue(d)) {
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
              if (pseudo || media || attrTarget) {
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

          if (pseudo && d.property) {
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
                (styleObj as any)[stylexProp] = { default: baseDefault, [pseudo]: alt.value };
                variantBuckets.set(when, {
                  ...variantBuckets.get(when),
                  [stylexProp]: { default: cons.value, [pseudo]: cons.value },
                });
                variantStyleKeys[when] ??= `${decl.styleKey}${toSuffixFromProp(when)}`;
                continue;
              }
            }
          }

          // Handle computed theme object access keyed by a prop:
          //   background-color: ${(props) => props.theme.colors[props.bg]}
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

              const fnKey = pseudo
                ? `${decl.styleKey}${toSuffixFromProp(out.prop)}${pseudoSuffix(pseudo)}`
                : `${decl.styleKey}${toSuffixFromProp(out.prop)}`;
              styleFnFromProps.push({ fnKey, jsxProp: indexPropName });

              if (!styleFnDecls.has(fnKey)) {
                // Build expression: resolvedExpr[indexPropName]
                const indexedExprAst = parseExpr(`(${resolved.expr})[${indexPropName}]`);
                if (!indexedExprAst) {
                  warnings.push({
                    type: "dynamic-node",
                    feature: "adapter-resolveValue",
                    message: `Adapter returned an unparseable expression for ${decl.localName}; dropping this declaration.`,
                  });
                  continue;
                }

                const param = j.identifier(indexPropName);
                // Prefer the prop's own type when available (e.g. `Color`) so we don't end up with
                // `keyof typeof themeVars` in fixture outputs.
                const propTsType = findJsxPropTsType(indexPropName);
                (param as any).typeAnnotation = j.tsTypeAnnotation(
                  (propTsType && typeof propTsType === "object" && (propTsType as any).type
                    ? (propTsType as any)
                    : j.tsStringKeyword()) as any,
                );
                if (pseudo) {
                  // For `&:hover` etc, emit nested selector styles so we don't have to guess defaults.
                  const nested = j.objectExpression([
                    j.property("init", j.identifier(out.prop), indexedExprAst as any) as any,
                  ]);
                  const p = j.property("init", j.literal(pseudo), nested) as any;
                  styleFnDecls.set(
                    fnKey,
                    j.arrowFunctionExpression([param], j.objectExpression([p])),
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
                  type: "dynamic-node",
                  feature: w.feature,
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
            const exprAst = parseExpr(res.expr);
            if (!exprAst) {
              warnings.push({
                type: "dynamic-node",
                feature: "adapter-resolveValue",
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
            const pos = res.variants.find((v: any) => !v.when.startsWith("!"));

            const cssProp = (d.property ?? "").trim();
            // Map CSS property to StyleX property (handle special cases like background → backgroundColor)
            const stylexProp =
              cssProp === "background" ? "backgroundColor" : cssPropertyToStylexProp(cssProp);

            // Extract static prefix/suffix from CSS value for wrapping resolved values
            // e.g., `rotate(${...})` should wrap the resolved value with `rotate(...)`.
            const getStaticPrefixSuffix = (): { prefix: string; suffix: string } => {
              const v = d.value as any;
              if (!v || v.kind !== "interpolated") {
                return { prefix: "", suffix: "" };
              }
              const parts: any[] = v.parts ?? [];
              const slotParts = parts.filter((p: any) => p?.kind === "slot");
              if (slotParts.length !== 1) {
                return { prefix: "", suffix: "" };
              }
              let prefix = "";
              let suffix = "";
              let foundSlot = false;
              for (const part of parts) {
                if (part?.kind === "slot") {
                  foundSlot = true;
                  continue;
                }
                if (part?.kind === "static") {
                  if (foundSlot) {
                    suffix += part.value ?? "";
                  } else {
                    prefix += part.value ?? "";
                  }
                }
              }
              return { prefix, suffix };
            };
            const { prefix: staticPrefix, suffix: staticSuffix } = getStaticPrefixSuffix();

            const parseResolved = (
              expr: string,
              imports: any[],
            ): { exprAst: unknown; imports: any[] } | null => {
              // If there's static prefix/suffix, wrap the expression
              // For simple string literals like `"90deg"`, produce a combined string literal like `"rotate(90deg)"`
              // instead of a template literal like `\`rotate(${"90deg"})\``
              let wrappedExpr = expr;
              if (staticPrefix || staticSuffix) {
                // Check if expr is a string literal (matches "..." or '...')
                const stringMatch = expr.match(/^["'](.*)["']$/);
                if (stringMatch) {
                  // Combine into a single string literal
                  wrappedExpr = JSON.stringify(staticPrefix + stringMatch[1] + staticSuffix);
                } else {
                  // Use template literal for non-literal expressions
                  wrappedExpr = `\`${staticPrefix}\${${expr}}${staticSuffix}\``;
                }
              }
              const exprAst = parseExpr(wrappedExpr);
              if (!exprAst) {
                warnings.push({
                  type: "dynamic-node",
                  feature: "adapter-resolveValue",
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
              // Default: use the property from cssDeclarationToStylexDeclarations
              target[stylexProp] = parsed.exprAst as any;
            };

            // IMPORTANT: stage parsing first. If either branch fails to parse, skip this declaration entirely
            // (mirrors the `resolvedValue` behavior) and avoid emitting empty variant buckets.
            const negParsed = neg ? parseResolved(neg.expr, neg.imports) : null;
            if (neg && !negParsed) {
              continue;
            }
            const posParsed = pos ? parseResolved(pos.expr, pos.imports) : null;
            if (pos && !posParsed) {
              continue;
            }

            if (negParsed) {
              applyParsed(styleObj as any, negParsed);
            }
            if (pos && posParsed) {
              const when = pos.when.replace(/^!/, "");
              const bucket = { ...variantBuckets.get(when) } as Record<string, unknown>;
              applyParsed(bucket, posParsed);
              variantBuckets.set(when, bucket);
              variantStyleKeys[when] ??= `${decl.styleKey}${toSuffixFromProp(when)}`;
            }
            continue;
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

                  // If this declaration is a simple interpolated string with a single slot and
                  // surrounding static text, preserve it by building a TemplateLiteral around the
                  // prop value, e.g. `${value}px`, `opacity ${value}ms`.
                  const buildValueExpr = (): any => {
                    const v: any = (d as any).value;
                    if (!v || v.kind !== "interpolated") {
                      return valueId;
                    }
                    const parts: any[] = v.parts ?? [];
                    const slotParts = parts.filter((p: any) => p?.kind === "slot");
                    if (slotParts.length !== 1) {
                      return valueId;
                    }
                    const onlySlot = slotParts[0]!;
                    if (onlySlot.slotId !== slotId) {
                      return valueId;
                    }

                    // If it's just the slot, keep it as the raw value (number/string).
                    const hasStatic = parts.some(
                      (p: any) => p?.kind === "static" && p.value !== "",
                    );
                    if (!hasStatic) {
                      return valueId;
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
                        exprs.push(valueId);
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
              type: "dynamic-node",
              feature: "dynamic-call",
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
              inlineStyleProps.push({
                prop: out.prop,
                expr:
                  e?.type === "ArrowFunctionExpression"
                    ? j.callExpression(e, [j.identifier("props")])
                    : e,
              });
            }
            continue;
          }
          warnings.push({
            type: "dynamic-node",
            feature: "dynamic-interpolation",
            message: `Unresolved interpolation for ${decl.localName}; skipping file (manual follow-up required).`,
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

          if (media) {
            perPropMedia[out.prop] ??= {};
            const existing = perPropMedia[out.prop]!;
            if (!("default" in existing)) {
              existing.default = (styleObj as any)[out.prop] ?? null;
            }
            existing[media] = value;
            continue;
          }

          if (pseudo) {
            perPropPseudo[out.prop] ??= {};
            const existing = perPropPseudo[out.prop]!;
            if (!("default" in existing)) {
              existing.default = (styleObj as any)[out.prop] ?? null;
            }
            existing[pseudo] = value;
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
    for (const [when, obj] of variantBuckets.entries()) {
      const key = variantStyleKeys[when]!;
      resolvedStyleObjects.set(key, obj);
    }
    for (const [k, v] of attrBuckets.entries()) {
      resolvedStyleObjects.set(k, v);
    }
    if (Object.keys(variantStyleKeys).length) {
      decl.variantStyleKeys = variantStyleKeys;
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

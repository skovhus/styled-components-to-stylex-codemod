import type { API } from "jscodeshift";
import { resolveDynamicNode } from "./builtin-handlers.js";
import { cssDeclarationToStylexDeclarations } from "./css-prop-mapping.js";
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
          (param as any).typeAnnotation = j.tsTypeAnnotation(j.tsStringKeyword());
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
      if ((d.property ?? "").trim() !== "border") {
        return false;
      }
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
        styleObj.borderWidth = width;
      }
      if (style) {
        styleObj.borderStyle = style;
      }

      // Now treat the interpolated portion as `borderColor`.
      const expr = decl.templateExpressions[slotId] as any;
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
          // Default to alternate; conditionally apply consequent.
          styleObj.borderColor = alt.value;
          const when = test.property.name;
          variantBuckets.set(when, {
            ...variantBuckets.get(when),
            borderColor: cons.value,
          });
          variantStyleKeys[when] ??= `${decl.styleKey}${toSuffixFromProp(when)}`;
          return true;
        }
      }

      // Simple color expression (identifier/member expression/template literal) → borderColor expr
      if (expr && expr.type !== "ArrowFunctionExpression") {
        styleObj.borderColor = expr as any;
        return true;
      }

      // fallback to inline style via wrapper
      if (decl.shouldForwardProp) {
        inlineStyleProps.push({
          prop: "borderColor",
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
          for (const out of cssDeclarationToStylexDeclarations(d)) {
            if (out.value.kind !== "static") {
              continue;
            }
            obj[out.prop] = cssValueToJs(out.value, d.important);
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
          for (const out of cssDeclarationToStylexDeclarations(d)) {
            if (out.value.kind !== "static") {
              continue;
            }
            obj[out.prop] = cssValueToJs(out.value, d.important);
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
                  ...(loc?.line !== undefined ? { line: loc.line } : {}),
                  ...(loc?.column !== undefined ? { column: loc.column } : {}),
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
              });
              continue;
            }
            for (const out of cssDeclarationToStylexDeclarations(d)) {
              styleObj[out.prop] = exprAst as any;
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

          if (res && res.type === "emitStyleFunction") {
            const jsxProp = res.call;
            for (const out of cssDeclarationToStylexDeclarations(d)) {
              const fnKey = `${decl.styleKey}${toSuffixFromProp(out.prop)}`;
              styleFnFromProps.push({ fnKey, jsxProp });

              if (!styleFnDecls.has(fnKey)) {
                const param = j.identifier(out.prop);
                (param as any).typeAnnotation = j.tsTypeAnnotation(j.tsStringKeyword());
                const p = j.property("init", j.identifier(out.prop), j.identifier(out.prop)) as any;
                p.shorthand = true;
                const body = j.objectExpression([p]);
                styleFnDecls.set(fnKey, j.arrowFunctionExpression([param], body));
              }
            }
            continue;
          }

          if (res && res.type === "keepOriginal") {
            warnings.push({
              type: "dynamic-node",
              feature: "dynamic-call",
              message: res.reason,
              ...(loc?.line !== undefined ? { line: loc.line } : {}),
              ...(loc?.column !== undefined ? { column: loc.column } : {}),
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
          });
          bail = true;
          break;
        }

        for (const out of cssDeclarationToStylexDeclarations(d)) {
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
              continue;
            }
            attrTarget[out.prop] = value;
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
            continue;
          }

          styleObj[out.prop] = value;
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

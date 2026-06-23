/**
 * Handles adapter-resolved split-variant value expansions.
 * Core concepts: parse resolved expressions and emit variant buckets safely.
 */
import type { CssDeclarationIR } from "../css-ir.js";
import type { WarningLog, WarningType } from "../logger.js";
import type { StyledDecl } from "../transform-types.js";
import type { LowerRulesState } from "./state.js";
import {
  BORDER_STYLES,
  borderLonghandProps,
  cssPropertyToStylexProp,
  parseBorderShorthandParts,
  parseInterpolatedBorderStaticParts,
  resolveBackgroundStylexProp,
  resolveBackgroundStylexPropForVariants,
} from "../css-prop-mapping.js";
import { extractStaticPartsForDecl, wrapExprWithStaticParts } from "./interpolations.js";
import { getUseLogicalProperties } from "../css-prop-mapping.js";
import { splitDirectionalProperty } from "../stylex-shorthands.js";
import { isAstNode } from "../utilities/jscodeshift-utils.js";
import { toSuffixFromProp } from "../transform/helpers.js";
import { capitalize } from "../utilities/string-utils.js";
import { appendImportantToStyleValue } from "./important-values.js";
import { registerImports } from "./utils.js";

type SplitVariantsContext = Pick<
  LowerRulesState,
  "j" | "warnings" | "parseExpr" | "resolverImports"
> & {
  decl: StyledDecl;
  d: CssDeclarationIR;
  res: any;
  styleObj: Record<string, unknown>;
  variantBuckets: Map<string, Record<string, unknown>>;
  variantStyleKeys: Record<string, string>;
  pseudos: string[] | null;
  media: string | undefined;
  resolvedSelectorMedia: { keyExpr: unknown; exprSource: string } | null;
  setBail: () => void;
  bailUnsupported: (decl: StyledDecl, type: WarningType) => void;
};

export function handleSplitVariantsResolvedValue(ctx: SplitVariantsContext): boolean {
  const {
    j,
    decl,
    d,
    res,
    styleObj,
    variantBuckets,
    variantStyleKeys,
    pseudos,
    media,
    resolvedSelectorMedia,
    parseExpr,
    resolverImports,
    warnings,
    setBail,
    bailUnsupported,
  } = ctx;

  if (!res || res.type !== "splitVariantsResolvedValue") {
    return false;
  }

  const neg = res.variants.find((v: any) => v.when.startsWith("!"));
  // Get ALL positive variants (not just one) for nested ternaries
  const allPos = res.variants.filter((v: any) => !v.when.startsWith("!"));

  const cssProp = (d.property ?? "").trim();
  let stylexProp: string;
  // For heterogeneous backgrounds, we'll determine the prop per-variant
  let isHeterogeneousBackground = false;
  if (cssProp === "background") {
    const variantValues = res.variants
      .filter((v: any) => typeof v.expr === "string")
      .map((v: any) => v.expr as string);
    const resolved = resolveBackgroundStylexPropForVariants(variantValues);
    if (!resolved) {
      // Heterogeneous - each variant gets its own StyleX property
      isHeterogeneousBackground = true;
      // Use a placeholder; actual prop is determined per-variant
      stylexProp = "backgroundColor";
    } else {
      stylexProp = resolved;
    }
  } else {
    stylexProp = cssPropertyToStylexProp(cssProp);
  }

  // Extract static prefix/suffix from CSS value for wrapping resolved values
  // e.g., `rotate(${...})` should wrap the resolved value with `rotate(...)`.
  const { prefix: staticPrefix, suffix: staticSuffix } = extractStaticPartsForDecl(d);

  const parseResolved = (
    expr: string,
    imports: any[],
  ): { exprAst: unknown; imports: any[] } | null =>
    parseResolvedAdapterExpr({
      expr,
      imports,
      staticPrefix,
      staticSuffix,
      parseExpr,
      decl,
      warnings,
    });

  // Helper to expand border shorthand from a string literal like "2px solid blue"
  // or a template literal like `1px solid ${color}` or `${width} solid ${color}`
  const expandBorderShorthand = (
    target: Record<string, unknown>,
    exprAst: any,
    direction: string = "", // "Top", "Right", "Bottom", "Left", or ""
  ): boolean => {
    const widthProp = `border${direction}Width`;
    const styleProp = `border${direction}Style`;
    const colorProp = `border${direction}Color`;

    // Handle various AST wrapper structures
    let node = exprAst;
    // Unwrap ExpressionStatement if present
    if (node?.type === "ExpressionStatement") {
      node = node.expression;
    }

    // Handle string literals: "2px solid blue"
    if (node?.type === "StringLiteral" || node?.type === "Literal") {
      const value = node.value;
      if (typeof value !== "string") {
        return false;
      }
      const parsed = parseBorderShorthandParts(value);
      if (!parsed) {
        return false;
      }
      const { width, style, color } = parsed;
      if (width) {
        target[widthProp] = j.literal(width);
      }
      if (style) {
        target[styleProp] = j.literal(style);
      }
      if (color) {
        target[colorProp] = j.literal(color);
      }
      return true;
    }

    // Handle template literals: `1px solid ${color}` or `${width} solid ${color}`
    if (node?.type === "TemplateLiteral") {
      const quasis = node.quasis ?? [];
      const exprs = node.expressions ?? [];

      // Format 1: `1px solid ${color}` - static width/style, dynamic color
      // quasis: ["1px solid ", ""], exprs: [colorExpr]
      if (quasis.length === 2 && exprs.length === 1) {
        const prefix = quasis[0]?.value?.cooked ?? quasis[0]?.value?.raw ?? "";
        const suffix = quasis[1]?.value?.cooked ?? quasis[1]?.value?.raw ?? "";

        // Format 1a: static prefix (width+style), dynamic color, empty suffix
        if (suffix.trim() === "") {
          const parsed = parseInterpolatedBorderStaticParts({
            prop: direction ? `border-${direction.toLowerCase()}` : "border",
            prefix,
            suffix,
          });
          if (parsed?.width && parsed?.style) {
            target[widthProp] = j.literal(parsed.width);
            target[styleProp] = j.literal(parsed.style);
            target[colorProp] = exprs[0];
            return true;
          }
        }

        // Format 3: `${width} solid color` - dynamic width, static style+color in suffix
        // quasis: ["", " solid transparent"], exprs: [widthExpr]
        // Reject when parseBorderShorthandParts also extracts a width, which means a
        // numeric token inside the color value (e.g., rgb(0 0 0 / 0.5)) was misclassified.
        if (prefix.trim() === "" && suffix.trim() !== "") {
          const parsed = parseBorderShorthandParts(suffix.trim());
          if (parsed?.style && parsed?.color && !parsed.width) {
            target[widthProp] = exprs[0];
            target[styleProp] = j.literal(parsed.style);
            target[colorProp] = j.literal(parsed.color);
            return true;
          }
        }
      }

      // Format 2: `${width} solid ${color}` - dynamic width, static style, dynamic color
      // quasis: ["", " solid ", ""], exprs: [widthExpr, colorExpr]
      if (quasis.length === 3 && exprs.length === 2) {
        const prefix = quasis[0]?.value?.cooked ?? quasis[0]?.value?.raw ?? "";
        const middle = quasis[1]?.value?.cooked ?? quasis[1]?.value?.raw ?? "";
        const suffix = quasis[2]?.value?.cooked ?? quasis[2]?.value?.raw ?? "";
        // First quasi should be empty (width is the first expression)
        if (prefix.trim() !== "") {
          return false;
        }
        // Last quasi should be empty (color is the last expression)
        if (suffix.trim() !== "") {
          return false;
        }
        // Middle quasi should contain only the border style
        const middleTrimmed = middle.trim();
        if (!BORDER_STYLES.has(middleTrimmed)) {
          return false;
        }
        target[widthProp] = exprs[0];
        target[styleProp] = j.literal(middleTrimmed);
        target[colorProp] = exprs[1];
        return true;
      }
    }

    return false;
  };

  const expandBoxShorthand = (
    target: Record<string, unknown>,
    exprAst: unknown,
    propName: "padding" | "margin",
  ): boolean => {
    const unwrapNode = (
      value: unknown,
    ): { type?: string; value?: unknown; expression?: unknown } | null => {
      return value && typeof value === "object"
        ? (value as { type?: string; value?: unknown; expression?: unknown })
        : null;
    };
    let node = unwrapNode(exprAst);
    if (node?.type === "ExpressionStatement") {
      node = unwrapNode(node.expression);
    }
    if (node?.type !== "StringLiteral" && node?.type !== "Literal") {
      return false;
    }
    const rawValue = node.value;
    if (typeof rawValue !== "string") {
      return false;
    }
    const entries = splitDirectionalProperty({
      prop: propName,
      rawValue,
      important: d.important,
      useLogical: getUseLogicalProperties(),
    });
    if (!entries.length) {
      return false;
    }
    for (const entry of entries) {
      target[entry.prop] = j.literal(entry.value);
    }
    return true;
  };

  const applyParsed = (
    target: Record<string, unknown>,
    parsed: { exprAst: unknown; imports: any[] },
    stylexPropOverride?: string,
  ): boolean => {
    const effectiveStylexProp = stylexPropOverride ?? stylexProp;
    registerImports(parsed.imports, resolverImports);

    // Get or create a condition map (pseudo/media) for a property, preserving the default value.
    // When the inherited base value is itself a pseudo/media map (e.g., styleObj already has
    // `{ default: A, ":focus": B }` from an earlier rule), flatten its `default` so we don't
    // produce a malformed nested map like `{ default: { default: A, ":focus": B } }`.
    const getOrCreateConditionMap = (prop: string): Record<string, unknown> => {
      const existing = target[prop];
      const map =
        existing && typeof existing === "object" && !Array.isArray(existing) && !isAstNode(existing)
          ? (existing as Record<string, unknown>)
          : ({} as Record<string, unknown>);
      if (!("default" in map)) {
        const baseValue = existing ?? styleObj[prop];
        map.default = unwrapConditionMapDefault(baseValue);
      }
      target[prop] = map;
      return map;
    };

    // Helper: apply a single prop value to target, respecting media/pseudo context.
    const applyWithContext = (prop: string, valueAstRaw: unknown): void => {
      const valueAst = appendImportantToStyleValue(j, valueAstRaw, d.important);
      if (media) {
        const map = getOrCreateConditionMap(prop);
        map[media] = valueAst as any;
        return;
      }
      if (resolvedSelectorMedia) {
        // Computed media key from adapter.resolveSelector (e.g., [breakpoints.phone])
        const map = getOrCreateConditionMap(prop);
        const computedKeys = ((map as any).__computedKeys ?? []) as Array<{
          keyExpr: unknown;
          value: unknown;
        }>;
        computedKeys.push({ keyExpr: resolvedSelectorMedia.keyExpr, value: valueAst });
        (map as any).__computedKeys = computedKeys;
        return;
      }
      if (pseudos?.length) {
        const map = getOrCreateConditionMap(prop);
        for (const ps of pseudos) {
          map[ps] = valueAst as any;
        }
        return;
      }
      target[prop] = valueAst as any;
    };

    // Special handling for border shorthand (including directional borders)
    const borderLonghand = borderLonghandProps(cssProp);
    if (borderLonghand) {
      const { direction } = borderLonghand;
      const tempBucket: Record<string, unknown> = {};
      if (expandBorderShorthand(tempBucket, parsed.exprAst, direction)) {
        for (const [prop, val] of Object.entries(tempBucket)) {
          applyWithContext(prop, val);
        }
        return true;
      }
      // Border shorthand couldn't be expanded — bail to prevent shorthand leak
      return false;
    }
    if (cssProp === "padding" || cssProp === "margin") {
      const tempBucket: Record<string, unknown> = {};
      if (expandBoxShorthand(tempBucket, parsed.exprAst, cssProp)) {
        for (const [prop, val] of Object.entries(tempBucket)) {
          applyWithContext(prop, val);
        }
        return true;
      }
      // Fall through to default handler — StyleX accepts single-value margin/padding
    }

    applyWithContext(effectiveStylexProp, parsed.exprAst);
    return true;
  };

  // IMPORTANT: stage parsing first. If either branch fails to parse, skip this declaration entirely
  // (mirrors the `resolvedValue` behavior) and avoid emitting empty variant buckets.
  const negParsed = neg ? parseResolved(neg.expr, neg.imports) : null;
  if (neg && !negParsed) {
    bailUnsupported(decl, "Adapter resolveCall returned an unparseable styles expression");
    setBail();
    return true;
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
    bailUnsupported(decl, "Adapter resolveCall returned an unparseable styles expression");
    setBail();
    return true;
  }

  // For heterogeneous backgrounds, we need each variant to go to its own bucket
  // with its own StyleX property (backgroundImage for gradients, backgroundColor for colors)
  if (isHeterogeneousBackground) {
    // Each variant gets its own StyleX property based on its value
    // (backgroundImage for gradients, backgroundColor for colors).
    // The default goes into the base style. Variants that use a different
    // property (e.g., backgroundImage when default is backgroundColor)
    // include a "transparent" reset so the base color doesn't bleed through
    // semi-transparent gradients — matching what the CSS `background`
    // shorthand does when switching between color and gradient values.
    const isNestedTernary = allPosParsed.length > 1;
    const defaultStylexProp = neg ? resolveBackgroundStylexProp(neg.expr) : null;

    if (neg && negParsed) {
      if (!applyParsed(styleObj as any, negParsed, defaultStylexProp!)) {
        bailUnsupported(
          decl,
          "Resolved conditional border variant could not be expanded to longhand properties",
        );
        setBail();
        return true;
      }
    }

    // Apply positive variants to their own buckets
    for (let i = 0; i < allPosParsed.length; i++) {
      const { when, nameHint, parsed } = allPosParsed[i]!;
      const posV = allPos[i]!;
      const posStylexProp = resolveBackgroundStylexProp(posV.expr);
      const whenClean = when.replace(/^!/, "");
      const bucket = { ...variantBuckets.get(whenClean) } as Record<string, unknown>;
      applyParsed(bucket, parsed, posStylexProp);
      if (defaultStylexProp && posStylexProp !== defaultStylexProp) {
        bucket[defaultStylexProp] = j.literal("transparent");
      }
      variantBuckets.set(whenClean, bucket);
      const genericHints = new Set(["truthy", "falsy", "default", "match"]);
      const useMeaningfulHint = isNestedTernary && nameHint && !genericHints.has(nameHint);
      const suffix = useMeaningfulHint
        ? nameHint.charAt(0).toUpperCase() + nameHint.slice(1)
        : toSuffixFromProp(whenClean);
      variantStyleKeys[whenClean] ??= `${decl.styleKey}${suffix}`;
    }
    return true;
  }

  if (negParsed) {
    if (!applyParsed(styleObj as any, negParsed)) {
      bailUnsupported(
        decl,
        "Resolved conditional border variant could not be expanded to longhand properties",
      );
      setBail();
      return true;
    }
  }
  // Apply all positive variants
  // For nested ternaries (multiple variants), use simpler nameHint-based naming.
  // For single-variant cases, use toSuffixFromProp which includes prop name (e.g., ColorPrimary).
  const isNestedTernary = allPosParsed.length > 1;
  for (const { when, nameHint, parsed } of allPosParsed) {
    const whenClean = when.replace(/^!/, "");
    const bucket = { ...variantBuckets.get(whenClean) } as Record<string, unknown>;
    if (!applyParsed(bucket, parsed)) {
      bailUnsupported(
        decl,
        "Resolved conditional border variant could not be expanded to longhand properties",
      );
      setBail();
      return true;
    }
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

  return true;
}

export function handleSplitMultiPropVariantsResolvedValue(ctx: SplitVariantsContext): boolean {
  const {
    decl,
    d,
    res,
    styleObj,
    variantBuckets,
    variantStyleKeys,
    warnings,
    setBail,
    bailUnsupported,
  } = ctx;

  if (!res || res.type !== "splitMultiPropVariantsResolvedValue") {
    return false;
  }

  const cssProp = (d.property ?? "").trim();
  let stylexPropMulti: string;
  if (cssProp === "background") {
    const variantValues = [
      res.outerTruthyBranch?.expr,
      res.innerTruthyBranch?.expr,
      res.innerFalsyBranch?.expr,
    ].filter((expr): expr is string => typeof expr === "string");
    const resolved = resolveBackgroundStylexPropForVariants(variantValues);
    if (!resolved) {
      // Heterogeneous - can't safely transform
      warnings.push({
        severity: "warning",
        type: "Heterogeneous background values (mix of gradients and colors) not currently supported",
        loc: decl.loc,
        context: { localName: decl.localName },
      });
      setBail();
      return true;
    }
    stylexPropMulti = resolved;
  } else {
    stylexPropMulti = cssPropertyToStylexProp(cssProp);
  }

  // Bail on border shorthands — compound variant expansion for these is unsupported
  if (/^border(Top|Right|Bottom|Left)?$/.test(stylexPropMulti)) {
    setBail();
    return true;
  }

  const { parseResolved, applyParsed } = buildCompoundVariantResolvers(
    ctx,
    stylexPropMulti,
    (existing) => unwrapConditionMapDefault(existing ?? styleObj[stylexPropMulti]),
  );

  // Parse all three branches
  const outerParsed = parseResolved(res.outerTruthyBranch.expr, res.outerTruthyBranch.imports);
  const innerTruthyParsed = parseResolved(
    res.innerTruthyBranch.expr,
    res.innerTruthyBranch.imports,
  );
  const innerFalsyParsed = parseResolved(res.innerFalsyBranch.expr, res.innerFalsyBranch.imports);

  if (!outerParsed || !innerTruthyParsed || !innerFalsyParsed) {
    bailUnsupported(decl, "Adapter resolveCall returned an unparseable styles expression");
    setBail();
    return true;
  }

  // Generate style keys for each branch
  const outerKey = `${decl.styleKey}${capitalize(res.outerProp)}`;

  // Always suffix inner when-keys with True/False to guarantee they never
  // collide with simple boolean variant keys that use the same prop name.
  // The collision can happen regardless of declaration order — the compound
  // or the boolean variant may be processed first.
  const innerTruthyWhen = `${res.innerProp}True`;
  const innerFalsyWhen = `${res.innerProp}False`;
  const innerTruthyKey = `${decl.styleKey}${capitalize(res.innerProp)}True`;
  const innerFalsyKey = `${decl.styleKey}${capitalize(res.innerProp)}False`;

  // Create variant buckets for each branch
  const outerBucket = { ...variantBuckets.get(res.outerProp) } as Record<string, unknown>;
  applyParsed(outerBucket, outerParsed);
  variantBuckets.set(res.outerProp, outerBucket);
  variantStyleKeys[res.outerProp] ??= outerKey;

  const innerTruthyBucket = { ...variantBuckets.get(innerTruthyWhen) } as Record<string, unknown>;
  applyParsed(innerTruthyBucket, innerTruthyParsed);
  variantBuckets.set(innerTruthyWhen, innerTruthyBucket);
  variantStyleKeys[innerTruthyWhen] ??= innerTruthyKey;

  const innerFalsyBucket = { ...variantBuckets.get(innerFalsyWhen) } as Record<string, unknown>;
  applyParsed(innerFalsyBucket, innerFalsyParsed);
  variantBuckets.set(innerFalsyWhen, innerFalsyBucket);
  variantStyleKeys[innerFalsyWhen] ??= innerFalsyKey;

  // Store compound variant info for emit phase
  decl.compoundVariants ??= [];
  decl.compoundVariants.push({
    kind: "3branch",
    outerProp: res.outerProp,
    outerTruthyKey: outerKey,
    innerProp: res.innerProp,
    innerTruthyKey,
    innerFalsyKey,
    innerTruthyWhen,
    innerFalsyWhen,
  });

  decl.needsWrapperComponent = true;
  return true;
}

export function handleDualBranchCompoundVariantsResolvedValue(ctx: SplitVariantsContext): boolean {
  const { decl, d, res, variantBuckets, variantStyleKeys, setBail, bailUnsupported } = ctx;

  if (!res || res.type !== "dualBranchCompoundVariantsResolvedValue") {
    return false;
  }

  const cssProp = (d.property ?? "").trim();
  const stylexProp = cssPropertyToStylexProp(cssProp);

  // Bail on border shorthands — compound variant expansion for these is unsupported
  if (/^border(Top|Right|Bottom|Left)?$/.test(stylexProp)) {
    setBail();
    return true;
  }

  const { parseResolved, applyParsed } = buildCompoundVariantResolvers(
    ctx,
    stylexProp,
    (existing) => existing ?? null,
  );

  // Parse all four branches
  const otitParsed = parseResolved(
    res.outerTruthyInnerTruthy.expr,
    res.outerTruthyInnerTruthy.imports,
  );
  const otifParsed = parseResolved(
    res.outerTruthyInnerFalsy.expr,
    res.outerTruthyInnerFalsy.imports,
  );
  const ofitParsed = parseResolved(
    res.outerFalsyInnerTruthy.expr,
    res.outerFalsyInnerTruthy.imports,
  );
  const ofifParsed = parseResolved(res.outerFalsyInnerFalsy.expr, res.outerFalsyInnerFalsy.imports);

  if (!otitParsed || !otifParsed || !ofitParsed || !ofifParsed) {
    bailUnsupported(decl, "Adapter resolveCall returned an unparseable styles expression");
    setBail();
    return true;
  }

  // Generate style keys for each of the 4 branches
  const outerCap = capitalize(res.outerProp);
  const innerCap = capitalize(res.innerProp);
  const otitKey = `${decl.styleKey}${outerCap}${innerCap}`;
  const otifKey = `${decl.styleKey}${outerCap}`;
  const ofitKey = `${decl.styleKey}${innerCap}`;
  const ofifKey = `${decl.styleKey}Default`;

  // Create variant buckets with compound "when" keys
  const applyBucket = (
    when: string,
    styleKey: string,
    parsed: { exprAst: unknown; imports: any[] },
  ): void => {
    const bucket = { ...variantBuckets.get(when) } as Record<string, unknown>;
    applyParsed(bucket, parsed);
    variantBuckets.set(when, bucket);
    variantStyleKeys[when] ??= styleKey;
  };

  applyBucket(`${res.outerProp}_${res.innerProp}`, otitKey, otitParsed);
  applyBucket(`${res.outerProp}_!${res.innerProp}`, otifKey, otifParsed);
  applyBucket(`!${res.outerProp}_${res.innerProp}`, ofitKey, ofitParsed);
  applyBucket(`!${res.outerProp}_!${res.innerProp}`, ofifKey, ofifParsed);

  // Store compound variant info for emit phase
  decl.compoundVariants ??= [];
  decl.compoundVariants.push({
    kind: "4branch",
    outerProp: res.outerProp,
    innerProp: res.innerProp,
    outerTruthyInnerTruthyKey: otitKey,
    outerTruthyInnerFalsyKey: otifKey,
    outerFalsyInnerTruthyKey: ofitKey,
    outerFalsyInnerFalsyKey: ofifKey,
  });

  decl.needsWrapperComponent = true;
  return true;
}

// --- Non-exported helpers ---

/**
 * When seeding `default` of a new pseudo/media map from an inherited base value,
 * collapse a base value that is itself a pseudo/media map down to its `default`
 * entry. Without this, layering a new pseudo override (e.g. variant bucket)
 * would produce a malformed nested map like
 * `{ default: { default: A, ":focus": B }, ":focus": C }`, which StyleX rejects
 * with "the same pseudo selector or at-rule cannot be used more than once".
 *
 * Returns `null` (the StyleX "no override" sentinel) when no usable default is
 * present.
 */
/**
 * Apply a parsed adapter result to a variant bucket entry. Handles both the
 * pseudo case (merge into a `{ default, ":hover": …, ... }` map) and the
 * non-pseudo case (overwrite the bucket value directly), and registers any
 * imports the adapter requested.
 *
 * Callers customize how the `default` slot is seeded for the pseudo case by
 * passing `defaultValueFor`. The two compound-variant resolvers seed it
 * differently: the 3-branch resolver collapses inherited pseudo maps via
 * `unwrapConditionMapDefault`, while the 4-branch resolver uses `existing ?? null`.
 */
function applyParsedPseudoMap(args: {
  target: Record<string, unknown>;
  parsed: { exprAst: unknown; imports: any[] };
  stylexProp: string;
  pseudos: string[] | null;
  resolverImports: LowerRulesState["resolverImports"];
  defaultValueFor: (existing: unknown) => unknown;
}): void {
  const { target, parsed, stylexProp, pseudos, resolverImports, defaultValueFor } = args;
  registerImports(parsed.imports, resolverImports);
  if (pseudos?.length) {
    const existing = target[stylexProp];
    const map =
      existing && typeof existing === "object" && !Array.isArray(existing) && !isAstNode(existing)
        ? (existing as Record<string, unknown>)
        : ({} as Record<string, unknown>);
    if (!("default" in map)) {
      map.default = defaultValueFor(existing);
    }
    for (const ps of pseudos) {
      map[ps] = parsed.exprAst as any;
    }
    target[stylexProp] = map;
    return;
  }
  target[stylexProp] = parsed.exprAst as any;
}

/**
 * Wrap an adapter-resolved expression source with the original CSS value's
 * static prefix/suffix and parse it into an AST node. Emits a warning and
 * returns `null` when parsing fails.
 */
function parseResolvedAdapterExpr(args: {
  expr: string;
  imports: any[];
  staticPrefix: string;
  staticSuffix: string;
  parseExpr: (source: string) => unknown;
  decl: StyledDecl;
  warnings: WarningLog[];
}): { exprAst: unknown; imports: any[] } | null {
  const { expr, imports, staticPrefix, staticSuffix, parseExpr, decl, warnings } = args;
  const wrappedExpr = wrapExprWithStaticParts(expr, staticPrefix, staticSuffix);
  const exprAst = parseExpr(wrappedExpr);
  if (!exprAst) {
    warnings.push({
      severity: "error",
      type: "Adapter resolveCall returned an unparseable styles expression",
      loc: decl.loc,
      context: { localName: decl.localName, expr },
    });
    return null;
  }
  return { exprAst, imports: imports ?? [] };
}

/**
 * Build the `parseResolved`/`applyParsed` closures shared by the compound
 * variant resolvers: they wrap adapter expressions with the declaration's
 * static prefix/suffix and apply the parsed result into a variant bucket for
 * `stylexProp`. Callers differ only in how the pseudo-map `default` slot is
 * seeded, supplied via `defaultValueFor`.
 */
function buildCompoundVariantResolvers(
  ctx: SplitVariantsContext,
  stylexProp: string,
  defaultValueFor: (existing: unknown) => unknown,
): {
  parseResolved: (expr: string, imports: any[]) => { exprAst: unknown; imports: any[] } | null;
  applyParsed: (
    target: Record<string, unknown>,
    parsed: { exprAst: unknown; imports: any[] },
  ) => void;
} {
  const { decl, d, parseExpr, resolverImports, warnings, pseudos } = ctx;
  const { prefix: staticPrefix, suffix: staticSuffix } = extractStaticPartsForDecl(d);

  const parseResolved = (expr: string, imports: any[]) =>
    parseResolvedAdapterExpr({
      expr,
      imports,
      staticPrefix,
      staticSuffix,
      parseExpr,
      decl,
      warnings,
    });

  const applyParsed = (
    target: Record<string, unknown>,
    parsed: { exprAst: unknown; imports: any[] },
  ): void => {
    applyParsedPseudoMap({
      target,
      parsed,
      stylexProp,
      pseudos,
      resolverImports,
      defaultValueFor,
    });
  };

  return { parseResolved, applyParsed };
}

function unwrapConditionMapDefault(value: unknown): unknown {
  if (!value || typeof value !== "object" || Array.isArray(value) || isAstNode(value)) {
    return value ?? null;
  }
  const map = value as Record<string, unknown>;
  if ("default" in map) {
    return map.default ?? null;
  }
  // Object without a `default` key — treat as no inherited base value.
  // (Bare pseudo-only maps like { ":focus": X } never appear here in practice
  // because callers always seed `default` first.)
  return null;
}

/**
 * Handles adapter-resolved split-variant value expansions.
 * Core concepts: parse resolved expressions and emit variant buckets safely.
 */
import type { CssDeclarationIR } from "../css-ir.js";
import type { WarningType } from "../logger.js";
import type { StyledDecl } from "../transform-types.js";
import type { ExpressionKind } from "./decl-types.js";
import type { JSCodeshift } from "jscodeshift";
import {
  BORDER_STYLES,
  cssPropertyToStylexProp,
  parseBorderShorthandParts,
  parseInterpolatedBorderStaticParts,
  resolveBackgroundStylexProp,
  resolveBackgroundStylexPropForVariants,
} from "../css-prop-mapping.js";
import { extractStaticParts, wrapExprWithStaticParts } from "./interpolations.js";
import { splitDirectionalProperty } from "../stylex-shorthands.js";
import { isAstNode } from "../utilities/jscodeshift-utils.js";
import { toSuffixFromProp } from "../transform/helpers.js";
import { capitalize } from "../utilities/string-utils.js";

type SplitVariantsContext = {
  j: JSCodeshift;
  decl: StyledDecl;
  d: CssDeclarationIR;
  res: any;
  styleObj: Record<string, unknown>;
  variantBuckets: Map<string, Record<string, unknown>>;
  variantStyleKeys: Record<string, string>;
  pseudos: string[] | null;
  media: string | undefined;
  parseExpr: (expr: string) => ExpressionKind | null;
  resolverImports: Map<string, any>;
  warnings: Array<{
    severity: "warning" | "error";
    type: WarningType;
    loc?: any;
    context?: any;
  }>;
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
  const { prefix: staticPrefix, suffix: staticSuffix } = extractStaticParts(d.value, {
    skipForProperty: /^border(-top|-right|-bottom|-left)?-color$/,
    property: cssProp,
  });

  const parseResolved = (
    expr: string,
    imports: any[],
  ): { exprAst: unknown; imports: any[] } | null => {
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
  };

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
        if (suffix.trim() !== "") {
          return false;
        }
        const parsed = parseInterpolatedBorderStaticParts({
          prop: direction ? `border-${direction.toLowerCase()}` : "border",
          prefix,
          suffix,
        });
        if (!parsed?.width || !parsed?.style) {
          return false;
        }
        target[widthProp] = j.literal(parsed.width);
        target[styleProp] = j.literal(parsed.style);
        target[colorProp] = exprs[0];
        return true;
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
  ): void => {
    const effectiveStylexProp = stylexPropOverride ?? stylexProp;
    for (const imp of parsed.imports) {
      resolverImports.set(JSON.stringify(imp), imp);
    }
    // Special handling for border shorthand (including directional borders)
    const borderMatch = cssProp.match(/^border(-top|-right|-bottom|-left)?$/);
    if (borderMatch) {
      const direction = borderMatch[1]
        ? borderMatch[1].slice(1).charAt(0).toUpperCase() + borderMatch[1].slice(2)
        : "";
      if (expandBorderShorthand(target, parsed.exprAst, direction)) {
        return;
      }
    }
    if (
      (cssProp === "padding" || cssProp === "margin") &&
      expandBoxShorthand(target, parsed.exprAst, cssProp)
    ) {
      return;
    }
    // Default: use the property from cssDeclarationToStylexDeclarations.
    // Preserve media/pseudo selectors by writing a per-prop map instead of
    // overwriting the base/default value.
    if (media) {
      const existing = target[effectiveStylexProp];
      const map =
        existing && typeof existing === "object" && !Array.isArray(existing) && !isAstNode(existing)
          ? (existing as Record<string, unknown>)
          : ({} as Record<string, unknown>);
      // Set default from target first, then fall back to base styleObj.
      // Only use null if neither has a value (for properties like outlineStyle that need explicit null).
      if (!("default" in map)) {
        const baseValue = existing ?? styleObj[effectiveStylexProp];
        map.default = baseValue ?? null;
      }
      map[media] = parsed.exprAst as any;
      target[effectiveStylexProp] = map;
      return;
    }
    if (pseudos?.length) {
      const existing = target[effectiveStylexProp];
      // `existing` may be:
      // - a scalar (string/number)
      // - an AST node (e.g. { type: "StringLiteral", ... })
      // - an already-built pseudo map (plain object with `default` / `:hover` keys)
      //
      // Only treat it as an existing pseudo map when it's a plain object *and* not an AST node.
      const map =
        existing && typeof existing === "object" && !Array.isArray(existing) && !isAstNode(existing)
          ? (existing as Record<string, unknown>)
          : ({} as Record<string, unknown>);
      // Set default from target first, then fall back to base styleObj.
      // Only use null if neither has a value (for properties like outlineStyle that need explicit null).
      if (!("default" in map)) {
        const baseValue = existing ?? styleObj[effectiveStylexProp];
        map.default = baseValue ?? null;
      }
      // Apply to all pseudos (e.g., both :hover and :focus for "&:hover, &:focus")
      for (const ps of pseudos) {
        map[ps] = parsed.exprAst as any;
      }
      target[effectiveStylexProp] = map;
      return;
    }

    target[effectiveStylexProp] = parsed.exprAst as any;
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
    // All branches go to variant buckets (no base style for heterogeneous backgrounds)
    const isNestedTernary = allPosParsed.length > 1;

    // Apply negative (falsy) variant to its own bucket
    if (neg && negParsed) {
      const negStylexProp = resolveBackgroundStylexProp(neg.expr);
      // Use the negated condition name for the bucket (e.g., "!$useGradient" -> "!$useGradient")
      const bucket = { ...variantBuckets.get(neg.when) } as Record<string, unknown>;
      applyParsed(bucket, negParsed, negStylexProp);
      variantBuckets.set(neg.when, bucket);
      const suffix = toSuffixFromProp(neg.when);
      variantStyleKeys[neg.when] ??= `${decl.styleKey}${suffix}`;
    }

    // Apply positive variants to their own buckets
    for (let i = 0; i < allPosParsed.length; i++) {
      const { when, nameHint, parsed } = allPosParsed[i]!;
      const posV = allPos[i]!;
      const posStylexProp = resolveBackgroundStylexProp(posV.expr);
      const whenClean = when.replace(/^!/, "");
      const bucket = { ...variantBuckets.get(whenClean) } as Record<string, unknown>;
      applyParsed(bucket, parsed, posStylexProp);
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
    pseudos,
    parseExpr,
    resolverImports,
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

  // Extract static prefix/suffix from CSS value for wrapping resolved values
  const { prefix: staticPrefix, suffix: staticSuffix } = extractStaticParts(d.value, {
    skipForProperty: /^border(-top|-right|-bottom|-left)?-color$/,
    property: cssProp,
  });

  const parseResolved = (
    expr: string,
    imports: any[],
  ): { exprAst: unknown; imports: any[] } | null => {
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
  };

  const applyParsed = (
    target: Record<string, unknown>,
    parsed: { exprAst: unknown; imports: any[] },
  ): void => {
    for (const imp of parsed.imports) {
      resolverImports.set(JSON.stringify(imp), imp);
    }
    if (pseudos?.length) {
      const existing = target[stylexPropMulti];
      const map =
        existing && typeof existing === "object" && !Array.isArray(existing) && !isAstNode(existing)
          ? (existing as Record<string, unknown>)
          : ({} as Record<string, unknown>);
      // Set default from target first, then fall back to base styleObj.
      // Only use null if neither has a value (for properties like outlineStyle that need explicit null).
      if (!("default" in map)) {
        const baseValue = existing ?? styleObj[stylexPropMulti];
        map.default = baseValue ?? null;
      }
      for (const ps of pseudos) {
        map[ps] = parsed.exprAst as any;
      }
      target[stylexPropMulti] = map;
      return;
    }
    target[stylexPropMulti] = parsed.exprAst as any;
  };

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
  const innerTruthyKey = `${decl.styleKey}${capitalize(res.innerProp)}True`;
  const innerFalsyKey = `${decl.styleKey}${capitalize(res.innerProp)}False`;

  // Create variant buckets for each branch
  const outerBucket = { ...variantBuckets.get(res.outerProp) } as Record<string, unknown>;
  applyParsed(outerBucket, outerParsed);
  variantBuckets.set(res.outerProp, outerBucket);
  variantStyleKeys[res.outerProp] ??= outerKey;

  const innerTruthyWhen = `${res.innerProp}True`;
  const innerTruthyBucket = { ...variantBuckets.get(innerTruthyWhen) } as Record<string, unknown>;
  applyParsed(innerTruthyBucket, innerTruthyParsed);
  variantBuckets.set(innerTruthyWhen, innerTruthyBucket);
  variantStyleKeys[innerTruthyWhen] ??= innerTruthyKey;

  const innerFalsyWhen = `${res.innerProp}False`;
  const innerFalsyBucket = { ...variantBuckets.get(innerFalsyWhen) } as Record<string, unknown>;
  applyParsed(innerFalsyBucket, innerFalsyParsed);
  variantBuckets.set(innerFalsyWhen, innerFalsyBucket);
  variantStyleKeys[innerFalsyWhen] ??= innerFalsyKey;

  // Store compound variant info for emit phase
  decl.compoundVariants ??= [];
  decl.compoundVariants.push({
    outerProp: res.outerProp,
    outerTruthyKey: outerKey,
    innerProp: res.innerProp,
    innerTruthyKey,
    innerFalsyKey,
  });

  decl.needsWrapperComponent = true;
  return true;
}

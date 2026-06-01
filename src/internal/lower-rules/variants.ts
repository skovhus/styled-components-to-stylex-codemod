/**
 * Groups variant buckets into dimensions for StyleX variants.
 * Core concepts: condition parsing and dimension construction.
 */
import type { VariantDimension } from "../transform-types.js";
import { styleKeyWithSuffix } from "../transform/helpers.js";

type ParsedVariantCondition =
  | {
      type: "equality";
      propName: string;
      operator: "===" | "!==";
      value: string;
      staticValue: string | number | boolean;
      conditionWhen?: string;
    }
  | { type: "boolean"; propName: string; negated: boolean }
  | { type: "compound" | "unknown" };

function parseVariantCondition(when: string): ParsedVariantCondition {
  const trimmed = when.trim();

  // Compound condition (contains &&)
  if (trimmed.includes("&&")) {
    const parts = trimmed
      .split("&&")
      .map((part) => part.trim())
      .filter(Boolean);
    const parsedParts = parts.map(parseVariantCondition);
    const equalityParts = parsedParts.filter((part) => part.type === "equality");
    if (equalityParts.length === 1) {
      const equality = equalityParts[0] as Extract<ParsedVariantCondition, { type: "equality" }>;
      const equalityIndex = parsedParts.findIndex((part) => part === equality);
      const guardParts = parts.filter((_, index) => index !== equalityIndex);
      if (guardParts.some((part) => part.includes("("))) {
        return {
          ...equality,
          conditionWhen: guardParts.join(" && "),
        };
      }
    }
    return { type: "compound" };
  }

  // Negated boolean: !propName or !(propName)
  if (trimmed.startsWith("!")) {
    const inner = trimmed
      .slice(1)
      .trim()
      .replace(/^\(|\)$/g, "");
    if (/^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(inner)) {
      return { type: "boolean", propName: inner, negated: true };
    }
    return { type: "unknown" };
  }

  // Equality: propName === "value" or propName !== "value"
  const eqMatch = trimmed.match(/^([a-zA-Z_$][a-zA-Z0-9_$]*)\s*(===|!==)\s*"([^"]*)"$/);
  if (eqMatch && eqMatch[1] && eqMatch[2] && eqMatch[3] !== undefined) {
    const value = eqMatch[3];
    return {
      type: "equality",
      propName: eqMatch[1],
      operator: eqMatch[2] as "===" | "!==",
      value,
      staticValue: value,
    };
  }

  const numberMatch = trimmed.match(
    /^([a-zA-Z_$][a-zA-Z0-9_$]*)\s*(===|!==)\s*(-?(?:0|[1-9]\d*)(?:\.\d+)?)$/,
  );
  if (numberMatch && numberMatch[1] && numberMatch[2] && numberMatch[3] !== undefined) {
    const value = Number(numberMatch[3]);
    if (Number.isFinite(value) && String(value) === numberMatch[3]) {
      return {
        type: "equality",
        propName: numberMatch[1],
        operator: numberMatch[2] as "===" | "!==",
        value: numberMatch[3],
        staticValue: value,
      };
    }
  }

  // Simple boolean: propName (no operators)
  if (/^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(trimmed)) {
    return { type: "boolean", propName: trimmed, negated: false };
  }

  return { type: "unknown" };
}

/**
 * Extract string literal values from a TypeScript union type.
 * Returns an array of literal values, or null if the type doesn't contain string literals.
 */
export function extractUnionLiteralValues(tsType: unknown): string[] | null {
  if (!tsType || typeof tsType !== "object") {
    return null;
  }

  const type = tsType as { type?: string; types?: unknown[]; literal?: { value?: unknown } };

  // Handle TSUnionType: "up" | "down" | "both"
  if (type.type === "TSUnionType" && Array.isArray(type.types)) {
    const values: string[] = [];
    for (const t of type.types) {
      const inner = t as { type?: string; literal?: { value?: unknown } };
      if (inner.type === "TSLiteralType" && typeof inner.literal?.value === "string") {
        values.push(inner.literal.value);
      }
    }
    return values.length > 0 ? values : null;
  }

  // Handle single TSLiteralType
  if (type.type === "TSLiteralType" && typeof type.literal?.value === "string") {
    return [type.literal.value];
  }

  return null;
}

export function hasFiniteNumericVariantKey(dimension: VariantDimension): boolean {
  return Object.keys(dimension.variants).some((key) => {
    if (key === "") {
      return false;
    }
    const value = Number(key);
    return Number.isFinite(value) && String(value) === key;
  });
}

/**
 * Groups variant buckets into dimensions for the StyleX variants recipe pattern.
 *
 * A dimension is created when:
 * - Multiple conditions test the same prop with `===` against different string values
 * - OR a single `===` condition exists (the else branch becomes a default variant)
 *
 * Compound conditions (e.g., `disabled && color === "primary"`) are kept separate
 * and not grouped into dimensions.
 */
export function groupVariantBucketsIntoDimensions(
  variantBuckets: Map<string, Record<string, unknown>>,
  variantStyleKeys: Record<string, string>,
  baseStyleKey: string,
  baseStyles: Record<string, unknown>,
  findJsxPropTsType?: (propName: string) => unknown,
  isJsxPropOptional?: (propName: string) => boolean,
): {
  dimensions: VariantDimension[];
  remainingBuckets: Map<string, Record<string, unknown>>;
  remainingStyleKeys: Record<string, string>;
  propsToStrip: Set<string>;
} {
  // Helper to generate variant object name, avoiding redundant "variantVariants"
  const getVariantObjectName = (
    propName: string,
    suffix?: "Enabled" | "Disabled",
    useBaseStyleKey?: boolean,
  ): string => {
    const baseName = useBaseStyleKey ? styleKeyWithSuffix(baseStyleKey, propName) : propName;
    if (propName === "variant") {
      return suffix ? `${suffix.toLowerCase()}Variants` : "variants";
    }
    return suffix ? `${baseName}${suffix}Variants` : `${baseName}Variants`;
  };

  // Group conditions by prop name (only equality conditions)
  const propGroups = new Map<
    string,
    Array<{ when: string; value: string; styles: Record<string, unknown>; conditionWhen?: string }>
  >();
  const remainingBuckets = new Map<string, Record<string, unknown>>();
  const remainingStyleKeys: Record<string, string> = {};
  // Track CSS props that should be stripped from base styles (moved to variants)
  const propsToStrip = new Set<string>();

  for (const [when, styles] of variantBuckets.entries()) {
    const parsed = parseVariantCondition(when);

    if (parsed.type === "equality" && parsed.operator === "===") {
      const existing = propGroups.get(parsed.propName) ?? [];
      existing.push({ when, value: parsed.value, styles, conditionWhen: parsed.conditionWhen });
      propGroups.set(parsed.propName, existing);
    } else {
      // Keep compound, boolean, and other conditions as-is
      remainingBuckets.set(when, styles);
      if (variantStyleKeys[when]) {
        remainingStyleKeys[when] = variantStyleKeys[when];
      }
    }
  }

  const dimensions: VariantDimension[] = [];

  // Collect boolean buckets and their CSS props (e.g., "disabled" → { backgroundColor, color })
  const booleanBuckets = new Map<
    string,
    { cssProps: Set<string>; styles: Record<string, unknown> }
  >();
  for (const [when, styles] of variantBuckets.entries()) {
    const parsed = parseVariantCondition(when);
    if (parsed.type === "boolean" && !parsed.negated) {
      booleanBuckets.set(parsed.propName, {
        cssProps: new Set(Object.keys(styles)),
        styles,
      });
    }
  }

  // Check if we're in a "variants-recipe" pattern: any enum has boolean overlap
  let isVariantsRecipePattern = false;
  for (const [, variants] of propGroups.entries()) {
    const variantCssProps = new Set(variants.flatMap((v) => Object.keys(v.styles)));
    for (const [, boolData] of booleanBuckets) {
      for (const cssProp of variantCssProps) {
        if (boolData.cssProps.has(cssProp)) {
          isVariantsRecipePattern = true;
          break;
        }
      }
      if (isVariantsRecipePattern) {
        break;
      }
    }
    if (isVariantsRecipePattern) {
      break;
    }
  }

  for (const [propName, variants] of propGroups.entries()) {
    const propType = findJsxPropTsType?.(propName);
    const unionValues = extractUnionLiteralValues(propType);

    // For single-condition variants, check if we can create a dimension
    const firstVariant = variants[0];
    if (variants.length === 1 && firstVariant) {
      const explicitValue = firstVariant.value;

      // Only create dimension if: variants-recipe pattern AND union has exactly 2 values
      if (
        isVariantsRecipePattern &&
        unionValues &&
        unionValues.length === 2 &&
        unionValues.includes(explicitValue)
      ) {
        // Continue to create dimension
      } else {
        // Move to remaining buckets (conditional pattern)
        for (const v of variants) {
          remainingBuckets.set(v.when, v.styles);
          const styleKey = variantStyleKeys[v.when];
          if (styleKey) {
            remainingStyleKeys[v.when] = styleKey;
          }
        }
        continue;
      }
    }

    // Build variant map with explicit values and infer default from base styles
    const variantMap: Record<string, Record<string, unknown>> = {};
    const allOverriddenProps = new Set<string>();
    const conditionGroup = commonConditionWhen(variants);
    if (!conditionGroup.canGroup) {
      for (const v of variants) {
        remainingBuckets.set(v.when, v.styles);
        const styleKey = variantStyleKeys[v.when];
        if (styleKey) {
          remainingStyleKeys[v.when] = styleKey;
        }
      }
      continue;
    }
    const { conditionWhen } = conditionGroup;

    for (const v of variants) {
      variantMap[v.value] = v.styles;
      for (const cssProp of Object.keys(v.styles)) {
        allOverriddenProps.add(cssProp);
      }
    }

    // Find base style values for overridden props (represents else branch)
    const defaultStyles: Record<string, unknown> = {};
    for (const cssProp of allOverriddenProps) {
      if (cssProp in baseStyles) {
        defaultStyles[cssProp] = baseStyles[cssProp];
      }
    }

    // Determine the default value name
    // For variants-recipe pattern with optional props, use actual value name + destructuring default
    // For other cases, use "default" key with cast+fallback
    let defaultValue: string | undefined;
    const propIsOptional = isJsxPropOptional?.(propName) ?? false;

    if (Object.keys(defaultStyles).length > 0 && unionValues) {
      const explicitValues = new Set(variants.map((v) => v.value));
      const remainingValues = unionValues.map(String).filter((v) => !explicitValues.has(v));
      if (remainingValues.length === 1 && remainingValues[0]) {
        // Use actual remaining value as key - for variants-recipe, this enables simple lookup
        // even for optional props when we emit destructuring defaults
        defaultValue = remainingValues[0];
        variantMap[defaultValue] = defaultStyles;
        // Note: We don't strip from base styles here - that only happens for namespace
        // dimensions where the ternary lookup guarantees a defined value
      } else {
        // Multiple remaining values - use "default" with cast+fallback
        defaultValue = "default";
        variantMap["default"] = defaultStyles;
      }
    }

    // Check if this prop has boolean overlap (needs namespace dimensions)
    const firstVariantForProps = variants[0];
    if (!firstVariantForProps) {
      continue;
    }
    const variantCssProps = new Set(Object.keys(firstVariantForProps.styles));
    let overlappingBoolProp: string | undefined;
    let overlappingBoolStyles: Record<string, unknown> | undefined;
    for (const [boolProp, boolData] of booleanBuckets) {
      for (const cssProp of variantCssProps) {
        if (boolData.cssProps.has(cssProp)) {
          overlappingBoolProp = boolProp;
          overlappingBoolStyles = boolData.styles;
          break;
        }
      }
      if (overlappingBoolProp) {
        break;
      }
    }

    if (overlappingBoolProp && overlappingBoolStyles) {
      // Create namespace dimensions: enabled and disabled
      // Enabled namespace: original variants
      dimensions.push({
        propName,
        variantObjectName: getVariantObjectName(propName, "Enabled", !!conditionWhen),
        variants: variantMap,
        defaultValue,
        ...(conditionWhen ? { conditionWhen } : {}),
        namespaceBooleanProp: overlappingBoolProp,
        isDisabledNamespace: false,
        isOptional: propIsOptional,
      });

      // Disabled namespace: variants merged with boolean styles
      const disabledVariantMap: Record<string, Record<string, unknown>> = {};
      for (const [variantValue, variantStyles] of Object.entries(variantMap)) {
        // Merge: boolean styles override variant styles, except hover stays from variant
        const merged: Record<string, unknown> = { ...variantStyles };
        for (const [cssProp, boolValue] of Object.entries(overlappingBoolStyles)) {
          const variantValue2 = merged[cssProp];
          // For pseudo maps (like backgroundColor with :hover), merge carefully
          if (
            typeof variantValue2 === "object" &&
            variantValue2 !== null &&
            typeof boolValue === "string"
          ) {
            // Boolean sets default, keep variant's hover
            merged[cssProp] = { ...(variantValue2 as object), default: boolValue };
          } else {
            merged[cssProp] = boolValue;
          }
        }
        // Also add any boolean styles that don't overlap with variant
        for (const [cssProp, boolValue] of Object.entries(overlappingBoolStyles)) {
          if (!(cssProp in merged)) {
            merged[cssProp] = boolValue;
          }
        }
        disabledVariantMap[variantValue] = merged as any;
      }

      dimensions.push({
        propName,
        variantObjectName: getVariantObjectName(propName, "Disabled", !!conditionWhen),
        variants: disabledVariantMap,
        defaultValue,
        ...(conditionWhen ? { conditionWhen } : {}),
        namespaceBooleanProp: overlappingBoolProp,
        isDisabledNamespace: true,
        isOptional: propIsOptional,
      });

      // Remove the boolean bucket from remaining since it's merged into disabled namespace
      remainingBuckets.delete(overlappingBoolProp);
      delete remainingStyleKeys[overlappingBoolProp];

      // Mark CSS props for stripping from base styles - namespace dimensions use a ternary
      // that guarantees a defined lookup, so base styles are not needed as fallback.
      for (const cssProp of variantCssProps) {
        propsToStrip.add(cssProp);
      }
    } else {
      // Simple dimension without namespace
      dimensions.push({
        propName,
        variantObjectName: getVariantObjectName(propName, undefined, !!conditionWhen),
        variants: variantMap,
        defaultValue,
        ...(conditionWhen ? { conditionWhen } : {}),
        isOptional: propIsOptional,
      });
    }
  }

  return { dimensions, remainingBuckets, remainingStyleKeys, propsToStrip };
}

function commonConditionWhen(variants: Array<{ conditionWhen?: string }>): {
  canGroup: boolean;
  conditionWhen?: string;
} {
  const conditions = [...new Set(variants.map((variant) => variant.conditionWhen))];
  if (conditions.length !== 1) {
    return { canGroup: false };
  }
  const conditionWhen = conditions[0];
  return conditionWhen ? { canGroup: true, conditionWhen } : { canGroup: true };
}

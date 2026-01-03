/**
 * Selector Lowering Module
 *
 * Converts nested CSS selectors that cannot be directly represented in StyleX
 * into separate style entries with a JSX rewrite plan.
 */

import type { StyleXObject } from "./css-to-stylex.js";

/**
 * Describes how to apply a lowered style in JSX
 */
export interface JSXRewriteRule {
  /** Name of the style entry (e.g., "child", "childNotFirst") */
  styleName: string;
  /** Which elements to apply to */
  target:
    | "all-children" // > * or *
    | "not-first-child" // :not(:first-child)
    | "not-last-child" // :not(:last-child)
    | "first-child" // :first-child
    | "last-child" // :last-child
    | "adjacent-sibling" // & + &
    | "general-sibling" // & ~ &
    | "descendant" // general descendant selector
    | "attribute"; // [attr] selectors on same element
  /** Original selector for reference */
  originalSelector: string;
  /** The styles to apply */
  styles: StyleXObject;
}

/**
 * Result of selector lowering
 */
export interface SelectorLoweringResult {
  /** Base styles for the component (without child/sibling selectors) */
  baseStyles: StyleXObject;
  /** Additional named style entries */
  additionalStyles: Map<string, StyleXObject>;
  /** Rules for JSX rewriting */
  jsxRewriteRules: JSXRewriteRule[];
}

/**
 * Check if a selector is a direct child selector (> *)
 */
function isDirectChildSelector(selector: string): boolean {
  const trimmed = selector.trim();
  return trimmed === ">*" || trimmed === "> *" || trimmed.startsWith("> ");
}

/**
 * Check if a selector is a universal child selector
 */
function isUniversalSelector(selector: string): boolean {
  const trimmed = selector.trim();
  return trimmed === "*" || trimmed === ">*" || trimmed === "> *";
}

/**
 * Check if a selector is an adjacent sibling selector (& + &)
 */
function isAdjacentSiblingSelector(selector: string): boolean {
  return selector.includes("+");
}

/**
 * Check if a selector is a general sibling selector (& ~ &)
 */
function isGeneralSiblingSelector(selector: string): boolean {
  return selector.includes("~");
}

/**
 * Lower selectors from a StyleX object into separate style entries
 */
export function lowerSelectors(
  styles: StyleXObject,
  _componentName: string,
): SelectorLoweringResult {
  const baseStyles: StyleXObject = {};
  const additionalStyles = new Map<string, StyleXObject>();
  const jsxRewriteRules: JSXRewriteRule[] = [];

  // Track child styles and their conditionals
  let childStyles: StyleXObject = {};
  let childNotFirstStyles: StyleXObject = {};
  let hasChildSelector = false;
  let hasChildNotFirst = false;

  for (const [key, value] of Object.entries(styles)) {
    // Check for direct child selectors
    if (isDirectChildSelector(key) || isUniversalSelector(key)) {
      hasChildSelector = true;

      if (typeof value === "object" && value !== null) {
        const childObj = value as StyleXObject;

        // Process the child styles
        for (const [childKey, childValue] of Object.entries(childObj)) {
          // Check for :not(:first-child) pseudo-class
          if (childKey === ":not(:first-child)") {
            hasChildNotFirst = true;
            if (typeof childValue === "object" && childValue !== null) {
              Object.assign(childNotFirstStyles, childValue);
            }
          }
          // Check for :not(:last-child) pseudo-class
          else if (childKey === ":not(:last-child)") {
            // Similar handling for last-child
            const styleName = "childNotLast";
            if (typeof childValue === "object" && childValue !== null) {
              additionalStyles.set(styleName, childValue as StyleXObject);
              jsxRewriteRules.push({
                styleName,
                target: "not-last-child",
                originalSelector: `${key} ${childKey}`,
                styles: childValue as StyleXObject,
              });
            }
          }
          // Regular child property
          else if (!childKey.startsWith(":")) {
            childStyles[childKey] = childValue;
          }
        }
      }
      continue;
    }

    // Check for property-level conditionals with :not(:first-child)
    if (typeof value === "object" && value !== null && "default" in value) {
      const conditional = value as StyleXObject;
      const hasNotFirstChild = ":not(:first-child)" in conditional;

      if (hasNotFirstChild) {
        // This is a conditional that applies to children
        // Move the :not(:first-child) value to childNotFirst styles
        hasChildNotFirst = true;
        const notFirstValue = conditional[":not(:first-child)"];
        if (notFirstValue !== undefined) {
          childNotFirstStyles[key] = notFirstValue;
        }

        // Keep only the default in base styles if it's not null
        if (conditional.default !== null) {
          baseStyles[key] = conditional.default;
        }
        continue;
      }
    }

    // Check for adjacent sibling selector
    if (isAdjacentSiblingSelector(key)) {
      if (typeof value === "object" && value !== null) {
        const styleName = "adjacentSibling";
        additionalStyles.set(styleName, value as StyleXObject);
        jsxRewriteRules.push({
          styleName,
          target: "adjacent-sibling",
          originalSelector: key,
          styles: value as StyleXObject,
        });
      }
      continue;
    }

    // Check for general sibling selector
    if (isGeneralSiblingSelector(key)) {
      if (typeof value === "object" && value !== null) {
        const styleName = "generalSibling";
        additionalStyles.set(styleName, value as StyleXObject);
        jsxRewriteRules.push({
          styleName,
          target: "general-sibling",
          originalSelector: key,
          styles: value as StyleXObject,
        });
      }
      continue;
    }

    // Keep other styles in base
    baseStyles[key] = value;
  }

  // Add child styles if we found any
  if (hasChildSelector && Object.keys(childStyles).length > 0) {
    additionalStyles.set("child", childStyles);
    jsxRewriteRules.push({
      styleName: "child",
      target: "all-children",
      originalSelector: "> *",
      styles: childStyles,
    });
  }

  // Add childNotFirst styles if we found any
  if (hasChildNotFirst && Object.keys(childNotFirstStyles).length > 0) {
    additionalStyles.set("childNotFirst", childNotFirstStyles);
    jsxRewriteRules.push({
      styleName: "childNotFirst",
      target: "not-first-child",
      originalSelector: "> *:not(:first-child)",
      styles: childNotFirstStyles,
    });
  }

  return {
    baseStyles,
    additionalStyles,
    jsxRewriteRules,
  };
}

/**
 * Generate a style name from a component name and suffix
 */
export function generateStyleName(componentName: string, suffix: string): string {
  const baseName = componentName.charAt(0).toLowerCase() + componentName.slice(1);
  return baseName + suffix.charAt(0).toUpperCase() + suffix.slice(1);
}

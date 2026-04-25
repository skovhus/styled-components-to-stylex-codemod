/**
 * CSS custom-property safety helpers.
 * Core concepts: StyleX rejects custom-property definitions in stylex.create().
 */

import type { WarningType } from "./logger.js";

export { CSS_CUSTOM_PROPERTY_DECLARATION_WARNING, isCssCustomPropertyDeclaration };

const CSS_CUSTOM_PROPERTY_DECLARATION_WARNING: WarningType =
  "CSS custom property declarations are not supported in StyleX";

function isCssCustomPropertyDeclaration(property: string): boolean {
  return property.trim().startsWith("--");
}

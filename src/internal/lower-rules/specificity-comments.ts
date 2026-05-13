/**
 * Shared comments for selectors whose styled-components specificity hacks were stripped.
 */

export function buildSpecificityStrippedComment(selector: string, prop: string): string {
  const base = `Specificity hack stripped (was: ${selector.trim()})`;
  if (!isBackgroundProperty(prop)) {
    return base;
  }
  return `${base}
TODO: Validate the default background color; StyleX requires an explicit default for conditional backgroundColor.`;
}

// --- Non-exported helpers ---

function isBackgroundProperty(prop: string): boolean {
  return prop === "background" || prop === "background-color" || prop === "backgroundColor";
}

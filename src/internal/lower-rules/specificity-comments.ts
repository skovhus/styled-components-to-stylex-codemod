/**
 * Shared comments for selectors whose styled-components specificity hacks were stripped.
 */

export function buildSpecificityStrippedComment(selector: string, prop: string): string {
  const lines = [`TODO: Specificity hack stripped, carefully test (was: ${selector.trim()})`];
  if (isBackgroundProperty(prop)) {
    lines.push(
      "TODO: Validate the default background color; StyleX requires an explicit default for conditional backgroundColor.",
    );
  }
  return lines.join("\n");
}

// --- Non-exported helpers ---

function isBackgroundProperty(prop: string): boolean {
  return prop === "background" || prop === "background-color" || prop === "backgroundColor";
}

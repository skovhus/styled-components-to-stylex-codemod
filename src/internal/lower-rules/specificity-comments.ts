/**
 * Shared comments for selectors whose styled-components specificity hacks were stripped.
 */

export function buildSpecificityStrippedComment(
  selector: string,
  prop: string,
  options?: SpecificityStrippedCommentOptions,
): string {
  const lines = [`TODO: Specificity hack stripped, carefully test (was: ${selector.trim()})`];
  if (options?.assumesConsumerSxLast) {
    lines.push(
      "TODO: Validate wrapped component applies consumer sx/stylex.props entries last so stripped specificity still wins.",
    );
  }
  if (isBackgroundProperty(prop)) {
    lines.push(
      "TODO: Validate the default background color; StyleX requires an explicit default for conditional backgroundColor.",
    );
  }
  return lines.join("\n");
}

// --- Non-exported helpers ---

type SpecificityStrippedCommentOptions = {
  assumesConsumerSxLast?: boolean;
};

function isBackgroundProperty(prop: string): boolean {
  return prop === "background" || prop === "background-color" || prop === "backgroundColor";
}

/**
 * Shared heuristic for determining whether a placeholder/expression is in a
 * CSS selector context rather than a property value context.
 *
 * Used by both the prepass scanner (on reconstructed CSS with placeholders)
 * and the consumer patcher (on raw TypeScript source).
 */

/**
 * Given the text before and after a template expression, determine if the
 * expression is in a CSS selector context (e.g. `${Foo} { ... }`) rather
 * than a property value context (e.g. `color: ${Foo};`).
 *
 * Selector clues:
 *   - Followed by `{` → definitely a selector
 *   - `{` appears before next `;` without a value-separator colon → likely selector
 *
 * Value clues:
 *   - Preceded by `:` with no intervening `{`, `}`, or `;` → value context
 *     (but `:hover`, `:focus` etc. are pseudo-selectors, not values)
 */
export function isSelectorContext(before: string, after: string): boolean {
  // If preceded by `:` with no `{`, `}`, or `;` between, it's a value context
  // (but `:hover`, `:focus` etc. are pseudo-selectors, not values)
  const lastSemiOrBrace = Math.max(
    before.lastIndexOf(";"),
    before.lastIndexOf("{"),
    before.lastIndexOf("}"),
  );
  const lastColon = before.lastIndexOf(":");
  if (lastColon > lastSemiOrBrace) {
    const colonContext = before.slice(lastColon).trim();
    if (!/^:[a-z-]+/i.test(colonContext)) {
      return false;
    }
  }

  // Followed by `{` → definitely a selector
  if (after.startsWith("{")) {
    return true;
  }

  // A `{` appears before the next `;` → likely a selector context.
  // Reject if there's a value-separator colon (`:` followed by whitespace),
  // but allow pseudo-selector colons (`:hover`, `::before`, `:nth-child()`).
  const afterUpToBrace = after.split("{")[0] ?? "";
  const afterUpToSemi = after.split(";")[0] ?? "";
  if (afterUpToBrace.length < afterUpToSemi.length) {
    const hasValueSeparatorColon = /:\s|:$/.test(afterUpToBrace);
    if (!hasValueSeparatorColon) {
      return true;
    }
  }

  return false;
}

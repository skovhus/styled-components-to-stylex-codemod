/**
 * Parses and normalizes selectors for StyleX compatibility checks.
 * Core concepts: pseudo/attribute parsing and selector normalization.
 */
import selectorParser from "postcss-selector-parser";
import { PLACEHOLDER_RE } from "./styled-css.js";

/**
 * Result of parsing a selector for StyleX compatibility.
 */
type ParsedSelector =
  | { kind: "base" } // Just "&"
  | { kind: "pseudo"; pseudos: string[] } // ":hover", ":focus:not(:disabled)", etc.
  | { kind: "pseudoElement"; element: string } // "::before", "::after"
  | { kind: "pseudoElements"; elements: string[] } // comma-separated: "::before", "::after"
  | { kind: "attribute"; attr: ParsedAttributeSelector }
  | { kind: "unsupported"; reason: string };

/**
 * CSS2 pseudo-elements that browsers accept with single-colon syntax.
 * These must be normalized to double-colon for StyleX compatibility.
 */
const CSS2_PSEUDO_ELEMENTS = new Set([":before", ":after", ":first-line", ":first-letter"]);

type ParsedAttributeSelector = {
  type:
    | "typeCheckbox"
    | "typeRadio"
    | "readonly"
    | "hrefStartsHttps"
    | "hrefEndsPdf"
    | "targetBlankAfter";
  suffix: string;
  pseudoElement?: string | null;
};

/**
 * Parse a CSS selector using postcss-selector-parser and determine
 * if it's compatible with StyleX (only pseudo-classes/elements on &).
 */
export function parseSelector(selector: string): ParsedSelector {
  const trimmed = selector.trim();

  // Handle base selector
  if (trimmed === "&" || trimmed === "") {
    return { kind: "base" };
  }

  // Check for attribute selectors first (special handling)
  const attrResult = parseAttributeSelectorInternal(trimmed);
  if (attrResult) {
    return { kind: "attribute", attr: attrResult };
  }

  try {
    const ast = selectorParser().astSync(trimmed);

    // We only support single selectors or comma-separated pseudo selectors
    const selectors = ast.nodes;

    if (selectors.length === 0) {
      return { kind: "base" };
    }

    // For comma-separated selectors, each must be a valid pseudo-class or pseudo-element on &
    if (selectors.length > 1) {
      const pseudos: string[] = [];
      const pseudoElementValues: string[] = [];
      for (const sel of selectors) {
        const result = parseSingleSelector(sel);
        if (result.kind === "pseudo" && result.pseudos.length === 1 && result.pseudos[0]) {
          pseudos.push(result.pseudos[0]);
        } else if (result.kind === "pseudoElement") {
          pseudoElementValues.push(result.element);
        } else {
          return {
            kind: "unsupported",
            reason: "comma-separated selectors must all be simple pseudos or pseudo-elements",
          };
        }
      }
      if (pseudos.length > 0 && pseudoElementValues.length > 0) {
        return {
          kind: "unsupported",
          reason: "mixed pseudo-classes and pseudo-elements in comma-separated selector",
        };
      }
      if (pseudoElementValues.length > 0) {
        // Sort to produce deterministic output regardless of source order
        pseudoElementValues.sort();
        return { kind: "pseudoElements", elements: pseudoElementValues };
      }
      return { kind: "pseudo", pseudos };
    }

    // Single selector
    const firstSelector = selectors[0];
    if (!firstSelector) {
      return { kind: "base" };
    }
    return parseSingleSelector(firstSelector);
  } catch {
    return { kind: "unsupported", reason: "failed to parse selector" };
  }
}

/**
 * Parse a single selector (not comma-separated).
 */
function parseSingleSelector(selector: selectorParser.Selector): ParsedSelector {
  const nodes = selector.nodes;

  if (nodes.length === 0) {
    return { kind: "base" };
  }

  // Check for unsupported patterns
  let hasNesting = false;
  let hasCombinator = false;
  let hasClass = false;
  let hasId = false;
  let hasTag = false;
  let hasUniversal = false;
  const pseudoClasses: selectorParser.Pseudo[] = [];
  const pseudoElements: selectorParser.Pseudo[] = [];
  const attributes: selectorParser.Attribute[] = [];

  for (const node of nodes) {
    switch (node.type) {
      case "nesting":
        hasNesting = true;
        break;
      case "combinator":
        // Space, >, +, ~ are all combinators indicating descendant/child/sibling
        // Note: space combinator has node.value of " " which is a valid combinator
        hasCombinator = true;
        break;
      case "class":
        hasClass = true;
        break;
      case "id":
        hasId = true;
        break;
      case "tag":
        hasTag = true;
        break;
      case "universal":
        hasUniversal = true;
        break;
      case "pseudo":
        if (node.value.startsWith("::") || CSS2_PSEUDO_ELEMENTS.has(node.value)) {
          pseudoElements.push(node);
        } else {
          pseudoClasses.push(node);
        }
        break;
      case "attribute":
        attributes.push(node);
        break;
    }
  }

  // Check for unsupported patterns
  if (hasCombinator) {
    return { kind: "unsupported", reason: "descendant/child/sibling selector" };
  }
  if (hasClass) {
    return { kind: "unsupported", reason: "class selector" };
  }
  if (hasId) {
    return { kind: "unsupported", reason: "id selector" };
  }
  if (hasTag) {
    return { kind: "unsupported", reason: "tag selector" };
  }
  if (hasUniversal) {
    return { kind: "unsupported", reason: "universal selector" };
  }

  // Handle self-attribute selectors (e.g., &[data-visible="true"])
  // StyleX doesn't support bare attribute selector keys, so we wrap them in
  // :is() to emit as a pseudo-class: ':is([data-visible="true"])'.
  // Must come before pseudo handling so attr+pseudo combos are caught.
  // Requires & (nesting) — without it, [attr] is a descendant selector.
  if (attributes.length > 0) {
    if (!hasNesting || hasCombinator || hasClass || hasId || hasTag || hasUniversal) {
      return { kind: "unsupported", reason: "attribute selector" };
    }
    if (pseudoClasses.length > 0 || pseudoElements.length > 0) {
      return { kind: "unsupported", reason: "attribute selector with pseudo" };
    }
    const attrStr = attributes.map((a) => a.toString()).join("");
    return { kind: "pseudo", pseudos: [`:is(${attrStr})`] };
  }

  // Must have nesting selector (&) or be just pseudos
  if (!hasNesting && (pseudoClasses.length > 0 || pseudoElements.length > 0)) {
    // Allow standalone pseudo selectors like ":hover" (equivalent to "&:hover")
  }

  // Handle pseudo-elements
  if (pseudoElements.length > 0) {
    if (pseudoElements.length > 1) {
      return { kind: "unsupported", reason: "multiple pseudo-elements" };
    }
    if (pseudoClasses.length > 0) {
      // Pseudo-classes with pseudo-elements is complex
      return { kind: "unsupported", reason: "pseudo-class with pseudo-element" };
    }
    const firstPseudoEl = pseudoElements[0];
    if (!firstPseudoEl) {
      return { kind: "unsupported", reason: "pseudo-element access error" };
    }
    return { kind: "pseudoElement", element: normalizePseudoElementColon(firstPseudoEl.value) };
  }

  // Handle pseudo-classes
  if (pseudoClasses.length > 0) {
    // Build the full pseudo string including chained :not() etc.
    const pseudoString = buildPseudoString(pseudoClasses);
    return { kind: "pseudo", pseudos: [pseudoString] };
  }

  // Just & with nothing else
  return { kind: "base" };
}

/**
 * Build the full pseudo-class string from parsed pseudo nodes.
 * Handles chained pseudos like :focus:not(:disabled).
 */
function buildPseudoString(pseudos: selectorParser.Pseudo[]): string {
  return pseudos
    .map((p) => {
      if (p.nodes && p.nodes.length > 0) {
        // Has arguments like :not(:disabled) or :nth-child(2)
        const inner = p.nodes.map((n) => n.toString()).join("");
        return `${p.value}(${inner})`;
      }
      return p.value;
    })
    .join("");
}

/**
 * Parse attribute selectors for special cases (input type, link href).
 */
function parseAttributeSelectorInternal(selector: string): ParsedAttributeSelector | null {
  // &[… ]::after (used for link external indicator)
  const afterSel = selector.match(/^&\[(.+)\](::after)$/) ?? selector.match(/^\[(.+)\](::after)$/);
  if (afterSel && afterSel[1]) {
    const inside = afterSel[1];
    if (inside.replace(/\s+/g, "") === 'target="_blank"') {
      return {
        type: "targetBlankAfter",
        suffix: "External",
        pseudoElement: "::after",
      };
    }
  }

  // &[…]
  const m = selector.match(/^&\[(.+)\]$/) ?? selector.match(/^\[(.+)\]$/);
  if (!m || !m[1]) {
    return null;
  }
  const inside = m[1];

  // [readonly] / [readOnly] → handled as JS prop conditional (not :read-only pseudo-class)
  // because CSS :read-only matches much more broadly than [readonly]: it also matches
  // disabled inputs, checkbox/radio, and other inherently non-editable elements.
  const boolAttr = inside.replace(/\s+/g, "").toLowerCase();
  if (boolAttr === "readonly") {
    return { type: "readonly", suffix: "Readonly" };
  }

  // type="checkbox" / type="radio"
  const typeEq = inside.match(/^type\s*=\s*"(checkbox|radio)"$/);
  if (typeEq) {
    return typeEq[1] === "checkbox"
      ? { type: "typeCheckbox", suffix: "Checkbox" }
      : { type: "typeRadio", suffix: "Radio" };
  }

  // href^="https" / href$=".pdf"
  const hrefOp = inside.match(/^href\s*([\\^$])=\s*"(.*)"$/);
  if (hrefOp) {
    const op = hrefOp[1];
    const val = hrefOp[2];
    if (op === "^" && val === "https") {
      return { type: "hrefStartsHttps", suffix: "Https" };
    }
    if (op === "$" && val === ".pdf") {
      return { type: "hrefEndsPdf", suffix: "Pdf" };
    }
  }

  // target="_blank"]::after
  const targetAfter = selector.match(/^&\[(target\s*=\s*"_blank")\](::after)$/);
  if (targetAfter) {
    return {
      type: "targetBlankAfter",
      suffix: "External",
      pseudoElement: "::after",
    };
  }

  // Fallback for target="_blank"::after
  if (selector.includes('[target="_blank"]') && selector.includes("::after")) {
    return {
      type: "targetBlankAfter",
      suffix: "External",
      pseudoElement: "::after",
    };
  }

  return null;
}

// =============================================================================
// Element selector parsing
// =============================================================================

/** Tags on which `[disabled]` is equivalent to `:disabled`. */
const DISABLEABLE_TAGS = new Set(["button", "input", "select", "textarea", "fieldset"]);
/** Tags on which `[checked]` is equivalent to `:checked`. */
const CHECKABLE_TAGS = new Set(["input"]);
/** Tags on which `[required]` is equivalent to `:required`. */
const REQUIRABLE_TAGS = new Set(["input", "select", "textarea"]);

/**
 * Maps an HTML boolean attribute selector to its CSS pseudo-class equivalent,
 * restricted to tags where the mapping is provably equivalent.
 *
 * `[readonly]` is intentionally excluded — CSS `:read-only` matches much more
 * broadly (disabled inputs, checkbox/radio, inherently non-editable elements),
 * so the mapping would be a behavioral change.
 *
 * Returns null if the attribute has no safe pseudo-class mapping for this tag.
 */
function mapAttributeToPseudo(attr: string, tagName: string): string | null {
  const normalized = attr.replace(/\s+/g, "").toLowerCase();
  const tag = tagName.toLowerCase();
  if (normalized === "disabled" && DISABLEABLE_TAGS.has(tag)) {
    return ":disabled";
  }
  if (normalized === "checked" && CHECKABLE_TAGS.has(tag)) {
    return ":checked";
  }
  if (normalized === "required" && REQUIRABLE_TAGS.has(tag)) {
    return ":required";
  }
  return null;
}

/**
 * Parses selectors like "& svg", "& > button", "&:hover svg", "& svg:hover",
 * "&:focus > button:disabled", "& > button[disabled]".
 *
 * Both descendant (space) and child (>) combinators are mapped the same way
 * because `stylex.when.ancestor()` matches ANY ancestor, not just a direct parent.
 * The child combinator is therefore less strict in the output than the original CSS.
 *
 * Attribute selectors on child elements (e.g., `button[disabled]`) are mapped to
 * their pseudo-class equivalents (`:disabled`) for StyleX compatibility.
 *
 * Returns null if the selector doesn't match an element selector pattern.
 */
export function parseElementSelectorPattern(selector: string): {
  tagName: string;
  ancestorPseudo: string | null;
  childPseudo: string | null;
} | null {
  const trimmed = selector.trim();

  // Pattern 1: "&" prefix with optional pseudos and combinator
  //   e.g., "& svg", "&:hover svg", "&>button", "& > button:disabled", "& > button[disabled]"
  const m = trimmed.match(
    /^&((?::[\w-]+(?:\([^)]*\))?)*)\s*(>?\s*)([a-zA-Z][a-zA-Z0-9]*)((?:\[[^\]]+\])?)((?::[\w-]+(?:\([^)]*\))?)*)$/,
  );
  if (m) {
    const ancestorPseudoRaw = m[1] ?? "";
    const tagName = m[3]!;
    const attrRaw = m[4] ?? "";
    const childPseudoRaw = m[5] ?? "";
    const childPseudo = resolveChildPseudoWithAttr(childPseudoRaw, attrRaw, tagName);
    if (childPseudo === undefined) {
      return null;
    }
    return {
      tagName,
      ancestorPseudo: ancestorPseudoRaw || null,
      childPseudo,
    };
  }

  // Pattern 2: Bare tag name with optional attribute and child pseudo
  //   (Stylis strips the `&` for simple descendant selectors)
  //   e.g., "svg", "button", "svg:hover", "button[disabled]"
  const bareM = trimmed.match(
    /^([a-zA-Z][a-zA-Z0-9]*)((?:\[[^\]]+\])?)((?::[\w-]+(?:\([^)]*\))?)*)$/,
  );
  if (bareM) {
    const bareTagName = bareM[1]!;
    const attrRaw = bareM[2] ?? "";
    const childPseudoRaw = bareM[3] ?? "";
    const childPseudo = resolveChildPseudoWithAttr(childPseudoRaw, attrRaw, bareTagName);
    if (childPseudo === undefined) {
      return null;
    }
    return {
      tagName: bareTagName,
      ancestorPseudo: null,
      childPseudo,
    };
  }

  // Pattern 3: Child combinator without `&` prefix (Stylis strips it)
  //   e.g., ">button", ">button:disabled", ">button[disabled]"
  const childCombM = trimmed.match(
    /^>\s*([a-zA-Z][a-zA-Z0-9]*)((?:\[[^\]]+\])?)((?::[\w-]+(?:\([^)]*\))?)*)$/,
  );
  if (childCombM) {
    const combTagName = childCombM[1]!;
    const attrRaw = childCombM[2] ?? "";
    const childPseudoRaw = childCombM[3] ?? "";
    const childPseudo = resolveChildPseudoWithAttr(childPseudoRaw, attrRaw, combTagName);
    if (childPseudo === undefined) {
      return null;
    }
    return {
      tagName: combTagName,
      ancestorPseudo: null,
      childPseudo,
    };
  }

  return null;
}

/**
 * Combines an explicit pseudo-class string with an optional attribute selector.
 * Returns the combined pseudo string, null if neither is present,
 * or undefined if the attribute can't be safely mapped for this tag.
 */
function resolveChildPseudoWithAttr(
  pseudoRaw: string,
  attrRaw: string,
  tagName: string,
): string | null | undefined {
  const pseudo = pseudoRaw || null;
  if (!attrRaw) {
    return pseudo;
  }
  const attrInner = attrRaw.slice(1, -1); // strip [ and ]
  const attrPseudo = mapAttributeToPseudo(attrInner, tagName);
  if (!attrPseudo) {
    return undefined; // unrecognized attribute or wrong tag → can't parse
  }
  // Combine: if both exist, concatenate (e.g., ":disabled:focus")
  return pseudo ? `${attrPseudo}${pseudo}` : attrPseudo;
}

/**
 * Normalize CSS2 single-colon pseudo-element values to double-colon.
 * E.g., ":before" → "::before", ":after" → "::after".
 * Already-double-colon values pass through unchanged.
 */
function normalizePseudoElementColon(value: string): string {
  if (CSS2_PSEUDO_ELEMENTS.has(value)) {
    return `:${value}`; // ":before" → "::before"
  }
  return value;
}

// =============================================================================
// Non-parsing utility functions (kept as-is)
// =============================================================================

/**
 * Normalize double-ampersand specificity hacks (`&&`) by collapsing to a single `&`.
 * Only handles `&&` (exactly two). Higher tiers (`&&&`, `&&&&`) are flagged as
 * `hasHigherTier` because flattening them can change cascade precedence.
 *
 * Examples:
 *   - `&&` → `&` (stripped)
 *   - `&&:hover` → `&:hover` (stripped)
 *   - `.wrapper &&` → `.wrapper &` (stripped, but `.wrapper` will be caught later)
 *   - `&&&` → flagged as hasHigherTier (not normalized)
 *   - `&:hover` → no change
 */
export function normalizeSpecificityHacks(selector: string): {
  normalized: string;
  wasStripped: boolean;
  hasHigherTier: boolean;
} {
  if (!selector.includes("&&")) {
    return { normalized: selector, wasStripped: false, hasHigherTier: false };
  }
  // Check for triple-or-more ampersand sequences
  if (/&{3,}/.test(selector)) {
    return { normalized: selector, wasStripped: false, hasHigherTier: true };
  }
  const normalized = selector.replace(/&&/g, "&");
  return { normalized, wasStripped: normalized !== selector, hasHigherTier: false };
}

export function normalizeInterpolatedSelector(selectorRaw: string): string {
  if (!PLACEHOLDER_RE.test(selectorRaw)) {
    return selectorRaw;
  }
  return (
    selectorRaw
      .replace(new RegExp(PLACEHOLDER_RE.source, "g"), "&")
      .replace(/\s+/g, " ")
      .trim()
      // Normalize `& &:pseudo` to `&:pseudo` (css helper interpolation + pseudo selector).
      // This handles patterns like `${rowBase}\n&:hover { ... }` where the css helper
      // interpolation becomes `&` and the nested pseudo selector is `&:hover`.
      // NOTE: `&&` without a pseudo is a specificity hack and is handled separately
      // by `normalizeSpecificityHacks()`.
      .replace(/&\s*&:/g, "&:")
      .replace(/&\s*:/g, "&:")
  );
}

export function normalizeSelectorForAttributePseudos(
  selector: string,
  tagName: string | null,
): string {
  if (!tagName) {
    return selector;
  }

  // Only convert [disabled] → :disabled for <input> elements.
  //
  // While [disabled] and :disabled are semantically equivalent when the attribute
  // is set directly, :disabled also matches elements disabled *indirectly* (e.g.,
  // a <button> inside <fieldset disabled>). This broader matching would change the
  // CSS behavior for non-input form elements, so we only apply this conversion for
  // <input> where the tradeoff is accepted and where other attribute-specific
  // handling (type=checkbox, type=radio, readonly) is already in place.
  //
  // Non-input elements with [disabled] fall through to parseSelector() which wraps
  // them in :is([disabled]) — a lossless, semantically-equivalent transformation.
  //
  // NOTE: [readonly] is NOT converted to :read-only because :read-only matches much
  // more broadly (disabled inputs, checkbox/radio, etc.) while [readonly] only matches
  // elements with the readonly attribute explicitly set. [readonly] is instead handled
  // as a JS prop conditional via the attrWrapper pattern.
  if (tagName.toLowerCase() !== "input") {
    return selector;
  }
  const m = selector.match(/^&\[(.+)\]$/) ?? selector.match(/^\[(.+)\]$/);
  if (!m || !m[1]) {
    return selector;
  }
  const inside = m[1].replace(/\s+/g, "");
  if (inside === "disabled") {
    return "&:disabled";
  }
  return selector;
}

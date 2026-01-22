import selectorParser from "postcss-selector-parser";

/**
 * Result of parsing a selector for StyleX compatibility.
 */
export type ParsedSelector =
  | { kind: "base" } // Just "&"
  | { kind: "pseudo"; pseudos: string[] } // ":hover", ":focus:not(:disabled)", etc.
  | { kind: "pseudoElement"; element: string } // "::before", "::after"
  | { kind: "attribute"; attr: ParsedAttributeSelector }
  | { kind: "unsupported"; reason: string };

type ParsedAttributeSelector = {
  type: "typeCheckbox" | "typeRadio" | "hrefStartsHttps" | "hrefEndsPdf" | "targetBlankAfter";
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

    // For comma-separated selectors, each must be a valid pseudo on &
    if (selectors.length > 1) {
      const pseudos: string[] = [];
      for (const sel of selectors) {
        const result = parseSingleSelector(sel);
        if (result.kind !== "pseudo" || result.pseudos.length !== 1) {
          return {
            kind: "unsupported",
            reason: "comma-separated selectors must all be simple pseudos",
          };
        }
        pseudos.push(result.pseudos[0]!);
      }
      return { kind: "pseudo", pseudos };
    }

    // Single selector
    return parseSingleSelector(selectors[0]!);
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
        if (node.value.startsWith("::")) {
          pseudoElements.push(node);
        } else {
          pseudoClasses.push(node);
        }
        break;
      case "attribute":
        // Attribute selectors like [disabled] - generally unsupported
        // (handled separately for specific cases like input[type="checkbox"])
        return { kind: "unsupported", reason: "attribute selector" };
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
    return { kind: "pseudoElement", element: pseudoElements[0]!.value };
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
  if (afterSel) {
    const inside = afterSel[1]!;
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
  if (!m) {
    return null;
  }
  const inside = m[1]!;

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
// Non-parsing utility functions (kept as-is)
// =============================================================================

export function normalizeInterpolatedSelector(selectorRaw: string): string {
  if (!/__SC_EXPR_\d+__/.test(selectorRaw)) {
    return selectorRaw;
  }
  return (
    selectorRaw
      .replace(/__SC_EXPR_\d+__/g, "&")
      .replace(/\s+/g, " ")
      .trim()
      // Normalize `& &:pseudo` to `&:pseudo` (css helper interpolation + pseudo selector).
      // This handles patterns like `${rowBase}\n&:hover { ... }` where the css helper
      // interpolation becomes `&` and the nested pseudo selector is `&:hover`.
      // NOTE: We intentionally do NOT normalize `& &` or `&&` without a pseudo, as those
      // are specificity hacks that should bail (handled in transform.ts).
      .replace(/&\s*&:/g, "&:")
      .replace(/&\s*:/g, "&:")
  );
}

export function normalizeSelectorForInputAttributePseudos(
  selector: string,
  isInput: boolean,
): string {
  if (!isInput) {
    return selector;
  }

  // Convert input attribute selectors into equivalent pseudo-classes so they can live
  // in the base style object (no wrapper needed).
  // - &[disabled]  -> &:disabled
  // - &[readonly]  -> &:read-only
  // - &[readOnly]  -> &:read-only (defensive)
  const m = selector.match(/^&\[(.+)\]$/) ?? selector.match(/^\[(.+)\]$/);
  if (!m) {
    return selector;
  }
  const inside = m[1]!.replace(/\s+/g, "");
  if (inside === "disabled") {
    return "&:disabled";
  }
  if (inside === "readonly" || inside === "readOnly") {
    return "&:read-only";
  }
  return selector;
}

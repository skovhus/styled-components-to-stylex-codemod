/**
 * Selector placeholder resolution and cross-file/reverse selector parsing.
 *
 * Resolves static attribute-selector placeholders, parses reverse and
 * nested-component selector patterns, and tags cross-file relation overrides.
 */
import type { StyledDecl } from "../transform-types.js";
import type { CssDeclarationIR } from "../css-ir.js";
import type { DeclProcessingState } from "./decl-setup.js";
import { buildSpecificityStrippedComment } from "./specificity-comments.js";
import {
  findPlaceholderBlock,
  findPreviousOpeningBraceBeforeSelector,
  parseSimpleParentPseudoSelectorList,
  readSelectorBeforeBlock,
} from "./shared.js";
import type { RelationOverride } from "./state.js";
import { resolveExpressionToStaticString } from "./resolve-imported-static-string.js";

/**
 * If a new relation override was created (array grew), tag it with cross-file metadata.
 * Used for both forward and reverse cross-file selector patterns.
 */
export function tagCrossFileOverride(
  relationOverrides: RelationOverride[],
  countBefore: number,
  markerVarName: string | undefined,
  componentLocalName: string,
): void {
  if (!markerVarName || relationOverrides.length <= countBefore) {
    return;
  }
  const created = relationOverrides.at(-1);
  if (!created) {
    return;
  }
  created.crossFile = true;
  created.markerVarName = markerVarName;
  created.crossFileComponentLocalName = componentLocalName;
}

export function resolveStaticAttributeSelectorPlaceholders(
  selector: string,
  decl: StyledDecl,
  state: DeclProcessingState["state"],
): string | null {
  if (!selector.includes("__SC_EXPR_")) {
    return selector;
  }

  let failed = false;
  const resolvedSelector = selector.replace(
    ATTRIBUTE_SELECTOR_WITH_PLACEHOLDER_RE,
    (attributeSelector) => {
      const match = attributeSelector.match(ATTRIBUTE_NAME_PLACEHOLDER_RE);
      if (!match?.[1]) {
        failed = true;
        return attributeSelector;
      }

      const slotId = Number(match[1]);
      const value = resolveExpressionToStaticString(decl.templateExpressions[slotId], state);
      if (value === null || !CSS_ATTRIBUTE_NAME_RE.test(value)) {
        failed = true;
        return attributeSelector;
      }

      return `[${value}${match[2] ?? ""}]`;
    },
  );

  return failed ? null : resolvedSelector;
}

export function extractParentPseudosForNestedComponentBlock(
  rawCss: string | undefined,
  slotId: number,
): string[] | null {
  if (!rawCss) {
    return null;
  }
  const placeholder = `__SC_EXPR_${slotId}__`;
  const componentBlock = findPlaceholderBlock(rawCss, placeholder);
  if (!componentBlock) {
    return null;
  }

  const componentSelector = readSelectorBeforeBlock(rawCss, componentBlock.end);
  if (componentSelector !== placeholder) {
    return null;
  }

  const parentSelectorBlockStart = findPreviousOpeningBraceBeforeSelector(
    rawCss,
    componentBlock.start,
  );
  if (parentSelectorBlockStart === null) {
    return null;
  }
  return parseSimpleParentPseudoSelectorList(
    readSelectorBeforeBlock(rawCss, parentSelectorBlockStart),
  );
}

/**
 * Checks if a comma-separated selector has all parts matching the reverse
 * component selector pattern (`__SC_EXPR_N__:pseudo &`). Different slot IDs
 * are allowed since Stylis assigns each `${Component}` reference its own slot.
 *
 * Example: `__SC_EXPR_0__:focus-visible &, __SC_EXPR_1__:active &`
 */
export function isCommaGroupedReverseSelectorPattern(selector: string): boolean {
  if (!selector.includes(",")) {
    return false;
  }
  const parts = selector.split(",").map((p) => p.trim());
  if (parts.length < 2) {
    return false;
  }
  // All parts must match the reverse selector pattern.
  // Different slot IDs are allowed since each `${Component}` reference in the
  // template gets its own slot, even when they reference the same local variable.
  for (const part of parts) {
    if (!REVERSE_SELECTOR_PART_RE.test(part)) {
      return false;
    }
  }
  return true;
}

/**
 * Extracts all pseudo-classes from a (possibly comma-separated) reverse
 * component selector. Each part is expected to match `__SC_EXPR_N__:pseudo &`.
 *
 * Returns e.g. [":focus-visible", ":active"] for
 * `__SC_EXPR_0__:focus-visible &, __SC_EXPR_0__:active &`.
 */
export function extractReverseSelectorPseudos(selector: string): string[] {
  const parts = selector.split(",").map((p) => p.trim());
  const pseudos: string[] = [];
  for (const part of parts) {
    const match = part.match(/__SC_EXPR_\d+__(:[a-z-]+(?:\([^)]*\))?)/i);
    if (match?.[1]) {
      pseudos.push(match[1]);
    }
  }
  return pseudos;
}

// --- Selector pattern regexes ---

/** Descendant-has pattern (full selector match): exactly `&:has(__SC_EXPR_N__)` */
export const HAS_COMPONENT_SELECTOR_STRICT_RE = /^&:has\(__SC_EXPR_\d+__\)\s*$/;

/** Reverse selector pattern for a single part: `__SC_EXPR_N__:pseudo &` */
const REVERSE_SELECTOR_PART_RE = /^__SC_EXPR_\d+__:[a-z][a-z0-9()-]*\s+&$/;

const ATTRIBUTE_SELECTOR_WITH_PLACEHOLDER_RE = /\[[^\][]*__SC_EXPR_\d+__[^\][]*\]/g;
const ATTRIBUTE_NAME_PLACEHOLDER_RE =
  /^\[\s*__SC_EXPR_(\d+)__(\s*(?:(?:[~|^$*]?=)\s*(?:"[^"]*"|'[^']*'|[^\]\s]+)\s*(?:[iIsS]\s*)?)?)\]$/;
const CSS_ATTRIBUTE_NAME_RE = /^(?:-?[_a-zA-Z]|--)[-_a-zA-Z0-9:.]*$/;

export function annotateSpecificityStrippedDeclaration(
  selector: string,
  firstDecl: CssDeclarationIR | undefined,
): void {
  if (!firstDecl || !selector.includes("&&")) {
    return;
  }
  const note = buildSpecificityStrippedComment(selector, firstDecl.property ?? "");
  firstDecl.leadingLineComment = firstDecl.leadingLineComment
    ? `${note}\n${firstDecl.leadingLineComment}`
    : note;
}

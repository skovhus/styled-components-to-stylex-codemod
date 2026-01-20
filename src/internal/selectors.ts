export function parseSimplePseudo(selector: string): string | null {
  // "&:hover" -> ":hover"
  const m = selector.match(/^&(:[a-zA-Z-]+)$/) ?? selector.match(/^(:[a-zA-Z-]+)$/);
  return m ? m[1]! : null;
}

/**
 * Parse comma-separated pseudo-selectors like "&:hover, &:focus" into an array [":hover", ":focus"].
 * Returns null if any part is not a valid simple pseudo-selector.
 */
export function parseCommaSeparatedPseudos(selector: string): string[] | null {
  const parts = selector.split(",").map((s) => s.trim());
  const pseudos: string[] = [];
  for (const part of parts) {
    const pseudo = parseSimplePseudo(part);
    if (!pseudo) {
      return null;
    }
    pseudos.push(pseudo);
  }
  return pseudos.length > 0 ? pseudos : null;
}

export function parsePseudoElement(selector: string): string | null {
  const m = selector.match(/^&(::[a-zA-Z-]+)$/) ?? selector.match(/^(::[a-zA-Z-]+)$/);
  return m ? m[1]! : null;
}

export function parseAttributeSelector(selector: string): {
  kind: "typeCheckbox" | "typeRadio" | "hrefStartsHttps" | "hrefEndsPdf" | "targetBlankAfter";
  suffix: string;
  pseudoElement?: string | null;
} | null {
  // &[… ]::after (used for link external indicator)
  const afterSel = selector.match(/^&\[(.+)\](::after)$/) ?? selector.match(/^\[(.+)\](::after)$/);
  if (afterSel) {
    const inside = afterSel[1]!;
    if (inside.replace(/\s+/g, "") === 'target="_blank"') {
      return {
        kind: "targetBlankAfter",
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
      ? { kind: "typeCheckbox", suffix: "Checkbox" }
      : { kind: "typeRadio", suffix: "Radio" };
  }

  // href^="https" / href$=".pdf"
  const hrefOp = inside.match(/^href\s*([\\^$])=\s*"(.*)"$/);
  if (hrefOp) {
    const op = hrefOp[1];
    const val = hrefOp[2];
    if (op === "^" && val === "https") {
      return { kind: "hrefStartsHttps", suffix: "Https" };
    }
    if (op === "$" && val === ".pdf") {
      return { kind: "hrefEndsPdf", suffix: "Pdf" };
    }
  }

  // target="_blank"]::after is encoded by stylis as selector '&[target="_blank"]::after' sometimes;
  // normalize by detecting 'target="_blank"]::after' in the selector string.
  const targetAfter = selector.match(/^&\[(target\s*=\s*"_blank")\](::after)$/);
  if (targetAfter) {
    return {
      kind: "targetBlankAfter",
      suffix: "External",
      pseudoElement: "::after",
    };
  }

  // Also accept '&[target="_blank"]::after' without the above match (fallback).
  if (selector.includes('[target="_blank"]') && selector.includes("::after")) {
    return {
      kind: "targetBlankAfter",
      suffix: "External",
      pseudoElement: "::after",
    };
  }

  return null;
}

export function normalizeInterpolatedSelector(selectorRaw: string): string {
  if (!/__SC_EXPR_\d+__/.test(selectorRaw)) {
    return selectorRaw;
  }
  return selectorRaw
    .replace(/__SC_EXPR_\d+__/g, "&")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/&\s*&/g, "&")
    .replace(/&\s*&:/g, "&:")
    .replace(/&\s*:/g, "&:");
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

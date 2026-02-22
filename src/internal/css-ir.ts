/**
 * Normalized CSS IR extracted from stylis output.
 * Core concepts: declaration/value modeling and selector normalization.
 */
import type { Element } from "stylis";
import { PLACEHOLDER_RE, type StyledInterpolationSlot } from "./styled-css.js";

export type CssValuePart = { kind: "static"; value: string } | { kind: "slot"; slotId: number };

export type CssValue =
  | { kind: "static"; value: string }
  | { kind: "interpolated"; parts: CssValuePart[] };

export type CssDeclarationIR = {
  property: string;
  value: CssValue;
  important: boolean;
  valueRaw: string;
  /**
   * Leading CSS comment (from `/* ... *\/`) that immediately precedes this declaration in the
   * original styled-components template literal.
   *
   * Stored as the comment body (without the surrounding block-comment markers).
   */
  leadingComment?: string;
  /**
   * Trailing comment that originated from an end-of-line `// ...` comment in the template literal.
   * This is preserved as a JS line comment on the corresponding StyleX object property.
   */
  trailingLineComment?: string;
};

export type CssRuleIR = {
  selector: string;
  atRuleStack: string[];
  declarations: CssDeclarationIR[];
};

type NormalizeOptions = {
  stripFormFeedInSelectors?: boolean;
  /**
   * Raw CSS text as authored in the template literal (best-effort).
   * Used only for comment placement heuristics.
   */
  rawCss?: string;
};

export function normalizeStylisAstToIR(
  stylisAst: Element[],
  slots: StyledInterpolationSlot[],
  options: NormalizeOptions = {},
): CssRuleIR[] {
  const stripFormFeedInSelectors = options.stripFormFeedInSelectors ?? true;
  const rawCss = options.rawCss ?? null;
  let rawCssCursor = 0;

  const slotByPlaceholder = new Map<string, number>();
  for (const slot of slots) {
    slotByPlaceholder.set(slot.placeholder, slot.index);
  }

  const rules: CssRuleIR[] = [];
  const atRuleStack: string[] = [];
  let pendingComment: string | null = null;
  let lastDecl: CssDeclarationIR | null = null;

  const stripBlockComment = (raw: string): string => {
    const trimmed = raw.trim();
    if (trimmed.startsWith("/*") && trimmed.endsWith("*/")) {
      return trimmed.slice(2, -2).trim();
    }
    return trimmed;
  };

  // Stylis rewrites end-of-line `// comment` to a `comm` node whose `value` looks like `/* comment*/`
  // (notably lacking the space before the closing `*/`). We treat those as "line comments" and
  // attach them to the preceding declaration.
  const isStylisConvertedLineComment = (raw: string): boolean => {
    const t = raw.trim();
    return t.startsWith("/*") && t.endsWith("*/") && !t.endsWith(" */");
  };

  const isInlineTrailingBlockCommentInRawCss = (rawComment: string): boolean => {
    if (!rawCss) {
      return false;
    }
    const token = rawComment.trim();
    if (!token) {
      return false;
    }
    const idx = rawCss.indexOf(token, rawCssCursor);
    if (idx === -1) {
      return false;
    }
    rawCssCursor = idx + token.length;

    // Walk backwards from the comment start:
    // - skip spaces/tabs
    // - if we hit a newline before a semicolon => not inline trailing
    // - if we hit a semicolon before any newline => inline trailing
    for (let i = idx - 1; i >= 0; i--) {
      const ch = rawCss[i]!;
      if (ch === " " || ch === "\t") {
        continue;
      }
      if (ch === "\n" || ch === "\r") {
        return false;
      }
      return ch === ";";
    }
    return false;
  };

  const handleCommentNode = (raw: string): void => {
    const body = stripBlockComment(raw);
    // Preserve actual `// ...` (stylis-converted) comments as trailing line comments.
    if (lastDecl && isStylisConvertedLineComment(raw)) {
      lastDecl.trailingLineComment = body;
      return;
    }
    // Preserve inline trailing block comments like:
    //   prop: value; /* comment */
    // as `// comment` after the StyleX property.
    if (lastDecl && isInlineTrailingBlockCommentInRawCss(raw)) {
      lastDecl.trailingLineComment = body;
      return;
    }
    pendingComment = body;
  };

  const ensureRule = (selector: string, stack: string[]): CssRuleIR => {
    const existing = rules.find((r) => r.selector === selector && sameArray(r.atRuleStack, stack));
    if (existing) {
      return existing;
    }
    const created: CssRuleIR = { selector, atRuleStack: [...stack], declarations: [] };
    rules.push(created);
    return created;
  };

  const visit = (node: Element | Element[] | undefined): void => {
    if (!node) {
      return;
    }
    if (Array.isArray(node)) {
      for (const child of node) {
        visit(child);
      }
      return;
    }

    if (node.type === "comm") {
      handleCommentNode(String(node.value ?? ""));
      return;
    }

    if (node.type === "decl") {
      const decls = parseDeclarations(String(node.value ?? ""), slotByPlaceholder);
      const firstDecl = decls[0];
      if (decls.length && firstDecl) {
        if (pendingComment) {
          firstDecl.leadingComment = pendingComment;
          pendingComment = null;
        }
        ensureRule("&", atRuleStack).declarations.push(...decls);
        lastDecl = decls[decls.length - 1] ?? null;
      }
      return;
    }

    if (node.type === "rule") {
      // Comments inside a rule should not leak out to following top-level nodes.
      const prevPending = pendingComment;
      const prevLastDecl = lastDecl;
      pendingComment = null;
      lastDecl = null;

      const selectorValue = String(node.value ?? "");
      const selectorRaw = stripFormFeedInSelectors
        ? selectorValue.replaceAll("\f", "")
        : selectorValue;
      const selector = selectorRaw;
      const rule = ensureRule(selector, atRuleStack);
      const children = node.children;
      if (children) {
        if (Array.isArray(children)) {
          for (const child of children) {
            if (child?.type === "decl") {
              const decls = parseDeclarations(String(child.value ?? ""), slotByPlaceholder);
              const firstDeclInner = decls[0];
              if (decls.length && firstDeclInner) {
                if (pendingComment) {
                  firstDeclInner.leadingComment = pendingComment;
                  pendingComment = null;
                }
                rule.declarations.push(...decls);
                lastDecl = decls[decls.length - 1] ?? null;
              }
            } else if (child?.type === "comm") {
              handleCommentNode(String(child.value ?? ""));
            } else {
              visit(child as Element);
            }
          }
        } else {
          visit(children as unknown as Element);
        }
      }

      pendingComment = prevPending;
      lastDecl = prevLastDecl;
      return;
    }

    if (typeof node.type === "string" && node.type.startsWith("@")) {
      const atType = String(node.type);
      const atValue = node.value !== undefined && node.value !== null ? String(node.value) : "";
      const at =
        atValue && !atValue.trim().startsWith(atType)
          ? `${atType} ${atValue}`.trim()
          : atValue || atType;
      atRuleStack.push(at);
      visit(node.children as Element[] | undefined);
      atRuleStack.pop();
      return;
    }

    visit(node.children as Element[] | undefined);
  };

  visit(stylisAst);

  // Stylis can completely drop “standalone” placeholders that appear as their own statement,
  // e.g. a template interpolation that returns a declaration block string:
  //   ${(props) => props.disabled && "color: red;"}
  //
  // In these cases, the placeholder never appears in the compiled AST, so we must recover it
  // from the raw template CSS and emit a synthetic dynamic-block declaration.
  //
  // We only recover placeholders at top-level (brace depth 0) to avoid accidentally pulling
  // placeholders from nested selector blocks or at-rules.
  if (rawCss) {
    // Accept optional trailing semicolon since templates often include `${expr};`
    const placeholderLineRe = /^__SC_EXPR_(\d+)__\s*;?\s*$/;
    let depth = 0;
    let line = "";

    const flushLine = () => {
      const trimmed = line.trim();
      if (depth === 0) {
        const m = trimmed.match(placeholderLineRe);
        if (m) {
          const slotId = Number(m[1]);
          const placeholder = `__SC_EXPR_${slotId}__`;
          // Only emit if this placeholder corresponds to a known slot.
          const mapped = slotByPlaceholder.get(placeholder);
          if (mapped !== undefined) {
            const alreadyDeclared = rules.some(
              (rule) =>
                rule.selector === "&" &&
                rule.atRuleStack.length === 0 &&
                rule.declarations.some((decl) => {
                  if (decl.property !== "" || decl.value.kind !== "interpolated") {
                    return false;
                  }
                  const parts = decl.value.parts;
                  return (
                    parts.length === 1 && parts[0]?.kind === "slot" && parts[0].slotId === mapped
                  );
                }),
            );
            if (alreadyDeclared) {
              line = "";
              return;
            }
            const decl: CssDeclarationIR = {
              property: "",
              value: { kind: "interpolated", parts: [{ kind: "slot", slotId: mapped }] },
              important: false,
              valueRaw: placeholder,
            };
            ensureRule("&", []).declarations.push(decl);
            lastDecl = decl;
          }
        }
      }
      line = "";
    };

    for (let i = 0; i < rawCss.length; i++) {
      const ch = rawCss[i]!;
      if (ch === "{") {
        depth++;
      } else if (ch === "}") {
        depth = Math.max(0, depth - 1);
      }
      if (ch === "\n") {
        flushLine();
        continue;
      }
      line += ch;
    }
    // Flush final line (if file doesn't end with newline).
    flushLine();
  }

  return rules;
}

function parseDeclarations(
  declValue: string,
  slotByPlaceholder: Map<string, number>,
): CssDeclarationIR[] {
  const trimmed = declValue.trim();
  if (!trimmed) {
    return [];
  }

  // Standalone interpolation placeholder:
  //   __SC_EXPR_0__
  // Stylis can emit this when an interpolation appears as its own statement (not part of `prop: value`),
  // e.g. `${(props) => props.disabled && "color: red;"}`
  // Without handling this case, we would drop the interpolation entirely and lose conditional blocks.
  const directSlot = slotByPlaceholder.get(trimmed);
  if (directSlot !== undefined) {
    return [
      {
        property: "",
        value: { kind: "interpolated", parts: [{ kind: "slot", slotId: directSlot }] },
        important: false,
        valueRaw: trimmed,
      },
    ];
  }

  // Stylis can merge a standalone interpolation placeholder with the following declaration:
  //   __SC_EXPR_0__ text-align:center;
  // Recover by splitting into:
  //   1) a synthetic "dynamic block" decl that points at the slot
  //   2) the real declaration (text-align:center)
  //
  // This enables the dynamic resolution pipeline (e.g. `props => props.$x && "transform: ...;"`) to be processed.
  const leadingSlot = trimmed.match(/^(__SC_EXPR_(\d+)__)\s+([\s\S]+)$/);
  if (leadingSlot && leadingSlot[1]) {
    const slotId = Number(leadingSlot[2]);
    const rest = leadingSlot[3] ?? "";
    return [
      {
        property: "",
        value: { kind: "interpolated", parts: [{ kind: "slot", slotId }] },
        important: false,
        valueRaw: leadingSlot[1],
      },
      ...parseDeclarations(rest, slotByPlaceholder),
    ];
  }

  const match = trimmed.match(/^([^:]+):([\s\S]+?);?$/);
  if (!match || !match[1] || !match[2]) {
    return [];
  }

  const property = match[1].trim();
  let valueRaw = match[2].trim();

  let important = false;
  if (/!important\s*$/i.test(valueRaw)) {
    important = true;
    valueRaw = valueRaw.replace(/!important\s*$/i, "").trim();
  }

  const value = parseCssValue(valueRaw, slotByPlaceholder);
  return [{ property, value, important, valueRaw }];
}

function parseCssValue(valueRaw: string, slotByPlaceholder: Map<string, number>): CssValue {
  const directSlot = slotByPlaceholder.get(valueRaw);
  if (directSlot !== undefined) {
    return { kind: "interpolated", parts: [{ kind: "slot", slotId: directSlot }] };
  }

  const placeholderPattern = new RegExp(PLACEHOLDER_RE.source, "g");
  const parts: CssValuePart[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = placeholderPattern.exec(valueRaw))) {
    const start = match.index;
    const end = start + match[0].length;
    if (start > lastIndex) {
      parts.push({ kind: "static", value: valueRaw.slice(lastIndex, start) });
    }
    parts.push({ kind: "slot", slotId: Number(match[1]) });
    lastIndex = end;
  }

  if (lastIndex < valueRaw.length) {
    parts.push({ kind: "static", value: valueRaw.slice(lastIndex) });
  }

  if (parts.length === 0) {
    return { kind: "static", value: valueRaw };
  }
  if (parts.every((p) => p.kind === "static")) {
    return { kind: "static", value: parts.map((p) => p.value).join("") };
  }

  return { kind: "interpolated", parts: coalesceStaticParts(parts) };
}

function coalesceStaticParts(parts: CssValuePart[]): CssValuePart[] {
  const out: CssValuePart[] = [];
  for (const part of parts) {
    const prev = out[out.length - 1];
    if (prev && prev.kind === "static" && part.kind === "static") {
      prev.value += part.value;
      continue;
    }
    out.push({ ...part });
  }
  return out;
}

function sameArray(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) {
    return false;
  }
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) {
      return false;
    }
  }
  return true;
}

/**
 * Check if any rule has a universal selector (`*`) in its selector string.
 */
export function hasUniversalSelectorInRules(rules: CssRuleIR[]): boolean {
  return rules.some((r) => typeof r.selector === "string" && r.selector.includes("*"));
}

/**
 * Compute the source location for a universal selector warning.
 * Combines the template's starting location with the line offset where the
 * universal selector appears in the raw CSS.
 */
export function computeUniversalSelectorLoc(
  templateLoc: { line: number; column: number } | null,
  rawCss: string,
): { line: number; column: number } | null {
  if (!templateLoc) {
    return null;
  }
  const lineOffset = findUniversalSelectorLineOffset(rawCss);
  return { line: templateLoc.line + lineOffset, column: 0 };
}

/**
 * Find the line offset (0-indexed) of a universal selector (`*`) within the raw CSS.
 * Returns the line number relative to the start of the CSS string.
 *
 * Stylis normalizes selectors (e.g., `& > *` becomes `>*`), so we can't reliably
 * match the exact selector string. Instead, we search for patterns that indicate
 * a universal selector in CSS: `*` followed by whitespace, `{`, or preceded by
 * combinator characters.
 *
 * @internal Exported for testing
 */
export function findUniversalSelectorLineOffset(rawCss: string): number {
  // Stylis normalizes selectors by removing spaces, so we need to search flexibly.
  // Look for the `*` character in a selector context (not inside a value like "100*2").
  // Universal selectors appear as: `& *`, `> *`, `+ *`, `~ *`, or just `*` at start

  // Helper to find non-whitespace character before/after a position
  const findNonWhitespaceBefore = (pos: number): string => {
    for (let j = pos - 1; j >= 0; j--) {
      if (!/\s/.test(rawCss[j]!)) {
        return rawCss[j]!;
      }
    }
    return "";
  };
  const findNonWhitespaceAfter = (pos: number): string => {
    for (let j = pos + 1; j < rawCss.length; j++) {
      if (!/\s/.test(rawCss[j]!)) {
        return rawCss[j]!;
      }
    }
    return "";
  };

  // Find all occurrences of `*` and check if they're in a selector context
  for (let i = 0; i < rawCss.length; i++) {
    const char = rawCss[i];
    if (char !== "*") {
      continue;
    }

    // Check if this `*` looks like a universal selector:
    // - preceded by whitespace, combinator, or start of line/string
    // - NOT preceded by value tokens like `%`, digits (which indicate calc/multiplication)
    // - followed by whitespace, `{`, `:`, `[`, or end of string
    // - NOT followed by digits (which indicate multiplication like `2 * 3`)
    const prevChar = i > 0 ? rawCss[i - 1]! : " ";
    const nextChar = i < rawCss.length - 1 ? rawCss[i + 1]! : " ";

    // Look at non-whitespace chars to detect value context (e.g., `calc(100% * 2)`)
    const prevNonWs = findNonWhitespaceBefore(i);
    const nextNonWs = findNonWhitespaceAfter(i);

    // Exclude `*` that appears to be multiplication in calc() or other expressions:
    // - `%` before (even with spaces): calc(100% * 2)
    // - digit before: calc(2 * 3)
    // - digit after: 2 * 3 or *2
    const isValueContext = /[%0-9]/.test(prevNonWs) || /[0-9]/.test(nextNonWs);
    if (isValueContext) {
      continue;
    }

    const validPrev = /[\s>&+~(,]/.test(prevChar) || i === 0;
    const validNext = /[\s{:[\],)]/.test(nextChar) || i === rawCss.length - 1;

    if (validPrev && validNext) {
      // Found a universal selector - count newlines before this position
      return countNewlinesBefore(rawCss, i);
    }
  }

  // Fallback: selector not found in raw CSS
  return 0;
}

/**
 * Find the line offset (0-indexed) of a specific selector within the raw CSS.
 * Returns the line number relative to the start of the CSS string.
 *
 * The selector may be normalized by Stylis (spaces removed, etc.), so we search
 * for key patterns from the selector that should still be present in the raw CSS.
 *
 * @internal Exported for testing
 */
export function findSelectorLineOffset(rawCss: string, selector: string): number {
  // Try to find a distinctive pattern from the selector in the raw CSS.
  // Selectors like "&:hover", "& > *", "&.active" should be findable.

  // First, try finding the selector directly (it may be present as-is)
  // Escape regex metacharacters since selectors contain `.`, `*`, `+` etc.
  const directMatch = rawCss.match(new RegExp(escapeRegExp(selector)));
  if (directMatch) {
    return countNewlinesBefore(rawCss, directMatch.index!);
  }

  // Try finding key parts of the selector:
  // 1. Pseudo-classes like :hover, :focus, :active, :not(...)
  // 2. Pseudo-elements like ::before, ::after
  // 3. Class selectors like .active
  // 4. Combinators with context like > *, + span

  // Extract pseudo-class/element patterns
  const pseudoMatch = selector.match(/::?[a-z-]+(?:\([^)]*\))?/i);
  if (pseudoMatch) {
    const pattern = pseudoMatch[0];
    // Search for this pseudo pattern followed by whitespace or {
    const idx = rawCss.indexOf(pattern);
    if (idx !== -1) {
      return countNewlinesBefore(rawCss, idx);
    }
  }

  // For interpolated selectors (__SC_EXPR_N__), try to find them
  const exprMatch = selector.match(PLACEHOLDER_RE);
  if (exprMatch) {
    const idx = rawCss.indexOf(exprMatch[0]);
    if (idx !== -1) {
      return countNewlinesBefore(rawCss, idx);
    }
  }

  // For class selectors, look for .className pattern
  const classMatch = selector.match(/\.[a-zA-Z0-9_-]+/);
  if (classMatch) {
    const idx = rawCss.indexOf(classMatch[0]);
    if (idx !== -1) {
      return countNewlinesBefore(rawCss, idx);
    }
  }

  // Fallback: not found
  return 0;
}

/**
 * Compute the location for a warning based on the template location and selector.
 * Returns an adjusted location that points to the selector's line in the raw CSS.
 */
export function computeSelectorWarningLoc(
  templateLoc: { line: number; column: number } | undefined,
  rawCss: string | undefined,
  selector: string,
): { line: number; column: number } | undefined {
  if (!templateLoc) {
    return undefined;
  }
  if (!rawCss) {
    return templateLoc;
  }
  const lineOffset = findSelectorLineOffset(rawCss, selector);
  return { line: templateLoc.line + lineOffset, column: 0 };
}

function countNewlinesBefore(str: string, position: number): number {
  let count = 0;
  for (let i = 0; i < position && i < str.length; i++) {
    if (str[i] === "\n") {
      count++;
    }
  }
  return count;
}

function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

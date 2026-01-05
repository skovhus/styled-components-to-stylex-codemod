import type { Element } from "stylis";
import type { StyledInterpolationSlot } from "./styled-css.js";

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

export type NormalizeOptions = {
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
      if (decls.length) {
        if (pendingComment) {
          decls[0]!.leadingComment = pendingComment;
          pendingComment = null;
        }
        ensureRule("&", atRuleStack).declarations.push(...decls);
        lastDecl = decls[decls.length - 1]!;
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
      const selector = stripFormFeedInSelectors
        ? selectorValue.replaceAll("\f", "")
        : selectorValue;
      const rule = ensureRule(selector, atRuleStack);
      const children = node.children;
      if (children) {
        if (Array.isArray(children)) {
          for (const child of children) {
            if (child?.type === "decl") {
              const decls = parseDeclarations(String(child.value ?? ""), slotByPlaceholder);
              if (decls.length) {
                if (pendingComment) {
                  decls[0]!.leadingComment = pendingComment;
                  pendingComment = null;
                }
                rule.declarations.push(...decls);
                lastDecl = decls[decls.length - 1]!;
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
      const at = String(node.value ?? node.type);
      atRuleStack.push(at);
      visit(node.children as Element[] | undefined);
      atRuleStack.pop();
      return;
    }

    visit(node.children as Element[] | undefined);
  };

  visit(stylisAst);
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

  // Stylis can merge a standalone interpolation placeholder with the following declaration:
  //   __SC_EXPR_0__ text-align:center;
  // Recover by splitting into:
  //   1) a synthetic "dynamic block" decl that points at the slot
  //   2) the real declaration (text-align:center)
  //
  // This enables the dynamic resolution pipeline (e.g. `props => props.$x && "transform: ...;"`) to be processed.
  const leadingSlot = trimmed.match(/^(__SC_EXPR_(\d+)__)\s+([\s\S]+)$/);
  if (leadingSlot) {
    const slotId = Number(leadingSlot[2]);
    const rest = leadingSlot[3] ?? "";
    return [
      {
        property: "",
        value: { kind: "interpolated", parts: [{ kind: "slot", slotId }] },
        important: false,
        valueRaw: leadingSlot[1]!,
      },
      ...parseDeclarations(rest, slotByPlaceholder),
    ];
  }

  const match = trimmed.match(/^([^:]+):([\s\S]+?);?$/);
  if (!match) {
    return [];
  }

  const property = match[1]!.trim();
  let valueRaw = match[2]!.trim();

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

  const placeholderPattern = /__SC_EXPR_(\d+)__/g;
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

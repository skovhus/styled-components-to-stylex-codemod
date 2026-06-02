/**
 * Recover authored multiline CSS declaration values from raw template CSS and
 * format emitted template literals to match readable multiline StyleX output.
 */
import type { API, TemplateLiteral } from "jscodeshift";

import { PLACEHOLDER_RE } from "../styled-css.js";
import { escapeRegex } from "./string-utils.js";

/** Indentation for continuation lines inside multiline CSS template literals in style objects. */
const MULTILINE_INDENT = "    ";

type AuthoredValuePart = { kind: "static"; value: string } | { kind: "slot"; slotId: number };

function normalizeValueForMatch(value: string): string {
  return value
    .replace(/\s+/g, " ")
    .replace(/\s*,\s*/g, ",")
    .trim();
}

function extractCssValueFrom(rawCss: string, valueStart: number): string | null {
  let i = valueStart;
  while (i < rawCss.length && /\s/.test(rawCss[i]!)) {
    i++;
  }
  const start = i;
  let depth = 0;
  let inString: false | '"' | "'" = false;
  let inComment = false;

  for (; i < rawCss.length; i++) {
    const ch = rawCss[i]!;
    if (!inString && !inComment && ch === "/" && rawCss[i + 1] === "*") {
      inComment = true;
      i++;
      continue;
    }
    if (inComment) {
      if (ch === "*" && rawCss[i + 1] === "/") {
        inComment = false;
        i++;
      }
      continue;
    }
    if ((ch === '"' || ch === "'") && rawCss[i - 1] !== "\\") {
      if (!inString) {
        inString = ch;
      } else if (inString === ch) {
        inString = false;
      }
      continue;
    }
    if (inString) {
      continue;
    }
    if (ch === "(") {
      depth++;
      continue;
    }
    if (ch === ")") {
      depth = Math.max(0, depth - 1);
      continue;
    }
    if (depth === 0 && ch === ";") {
      return rawCss.slice(start, i);
    }
    if (depth === 0 && ch === "}") {
      return rawCss.slice(start, i);
    }
  }
  if (start < rawCss.length) {
    return rawCss.slice(start);
  }
  return null;
}

export function findAuthoredDeclarationValue(
  rawCss: string | null | undefined,
  property: string,
  stylisValueRaw: string,
): string | null {
  if (!rawCss?.trim()) {
    return null;
  }
  const normalizedTarget = normalizeValueForMatch(stylisValueRaw);
  const propRe = new RegExp(`(?:^|[\\s{])${escapeRegex(property)}\\s*:`, "gi");
  let match: RegExpExecArray | null;
  while ((match = propRe.exec(rawCss))) {
    const colonIndex = match.index + match[0].lastIndexOf(":");
    const value = extractCssValueFrom(rawCss, colonIndex + 1);
    if (value && normalizeValueForMatch(value) === normalizedTarget) {
      return value;
    }
  }
  return null;
}

function parseAuthoredValueParts(value: string): AuthoredValuePart[] {
  const parts: AuthoredValuePart[] = [];
  const placeholderPattern = new RegExp(PLACEHOLDER_RE.source, "g");
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = placeholderPattern.exec(value))) {
    const start = match.index;
    if (start > lastIndex) {
      parts.push({ kind: "static", value: value.slice(lastIndex, start) });
    }
    parts.push({ kind: "slot", slotId: Number(match[1]) });
    lastIndex = start + match[0].length;
  }
  if (lastIndex < value.length) {
    parts.push({ kind: "static", value: value.slice(lastIndex) });
  }
  return parts;
}

function normalizeStaticMultilineChunk(
  chunk: string,
  isFirst: boolean,
  isLast: boolean,
  beforeSlot: boolean,
): string {
  let text = chunk;
  if (isFirst) {
    text = text.replace(/^\s+/, "");
  }
  if (isLast) {
    text = text.replace(/\s+$/, "");
  } else if (!beforeSlot) {
    text = text.replace(/\s+$/, "");
  }
  return text.replace(/,\s*\r?\n\s*/g, `,\n${MULTILINE_INDENT}`);
}

function formatAuthoredMultilineValue(authoredValue: string): string | null {
  if (!/\r?\n/.test(authoredValue)) {
    return null;
  }
  const parts = parseAuthoredValueParts(authoredValue);
  if (parts.length === 0) {
    return null;
  }
  const slotCount = parts.filter((part) => part.kind === "slot").length;
  if (slotCount === 0) {
    return null;
  }

  let formatted = "";
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i]!;
    if (part.kind === "slot") {
      continue;
    }
    const isFirst = i === 0;
    const isLast = i === parts.length - 1;
    const nextPart = parts[i + 1];
    const beforeSlot = nextPart?.kind === "slot";
    const staticText = normalizeStaticMultilineChunk(part.value, isFirst, isLast, beforeSlot);
    if (!staticText) {
      continue;
    }
    if (isFirst) {
      formatted += `\n${MULTILINE_INDENT}${staticText}`;
      continue;
    }
    formatted += staticText;
  }

  return formatted || null;
}

export function applyAuthoredMultilineTemplateFormatting(
  j: API["jscodeshift"],
  templateLiteral: TemplateLiteral,
  authoredValue: string,
): TemplateLiteral {
  if (!formatAuthoredMultilineValue(authoredValue)) {
    return templateLiteral;
  }

  const authoredParts = parseAuthoredValueParts(authoredValue);
  const authoredSlotCount = authoredParts.filter((part) => part.kind === "slot").length;
  if (authoredSlotCount !== templateLiteral.expressions.length) {
    return templateLiteral;
  }

  const quasis: Array<ReturnType<API["jscodeshift"]["templateElement"]>> = [];
  let staticBuffer = "";
  let slotIndex = 0;

  for (const part of authoredParts) {
    if (part.kind === "static") {
      staticBuffer += part.value;
      continue;
    }
    const isFirst = slotIndex === 0;
    const quasiText = normalizeStaticMultilineChunk(staticBuffer, isFirst, false, true);
    const raw =
      isFirst && quasiText ? `\n${MULTILINE_INDENT}${quasiText.replace(/^\s+/, "")}` : quasiText;
    quasis.push(j.templateElement({ raw, cooked: raw }, false));
    staticBuffer = "";
    slotIndex++;
  }

  const trailing = normalizeStaticMultilineChunk(staticBuffer, slotIndex === 0, true, false);
  quasis.push(j.templateElement({ raw: trailing, cooked: trailing }, true));

  return j.templateLiteral(quasis, templateLiteral.expressions);
}

export function maybeApplyAuthoredMultilineTemplateFormatting(args: {
  j: API["jscodeshift"];
  templateLiteral: TemplateLiteral;
  rawCss?: string | null;
  property: string;
  stylisValueRaw: string;
}): TemplateLiteral {
  const authoredValue = findAuthoredDeclarationValue(
    args.rawCss,
    args.property,
    args.stylisValueRaw,
  );
  if (!authoredValue) {
    return args.templateLiteral;
  }
  return applyAuthoredMultilineTemplateFormatting(args.j, args.templateLiteral, authoredValue);
}

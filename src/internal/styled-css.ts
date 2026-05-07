/**
 * Parses styled-components template literals into raw CSS + slots.
 * Core concepts: Stylis AST generation and interpolation slot tracking.
 */
import type { Expression, TemplateLiteral } from "jscodeshift";
import { compile } from "stylis";
import type { Element } from "stylis";

/** Matches `__SC_EXPR_N__` and captures the slot index in group 1. */
export const PLACEHOLDER_RE = /__SC_EXPR_(\d+)__/;

export type StyledInterpolationSlot = {
  index: number;
  placeholder: string;
  expression: Expression;
  startOffset: number;
  endOffset: number;
};

type ParsedStyledTemplate = {
  rawCss: string;
  slots: StyledInterpolationSlot[];
  stylisAst: Element[];
};

export function parseStyledTemplateLiteral(template: TemplateLiteral): ParsedStyledTemplate {
  const parts: string[] = [];
  const slots: StyledInterpolationSlot[] = [];

  for (let i = 0; i < template.quasis.length; i++) {
    const quasi = template.quasis[i]!;
    parts.push(quasi.value.raw);

    const expr = template.expressions[i];
    if (!expr) {
      continue;
    }

    const placeholder = makeInterpolationPlaceholder(i);
    const startOffset = parts.join("").length;
    parts.push(placeholder);
    const endOffset = parts.join("").length;

    slots.push({
      index: i,
      placeholder,
      expression: expr,
      startOffset,
      endOffset,
    });
  }

  const rawCss = parts.join("");
  const stylisCss = terminateStandaloneInterpolationStatements(rawCss);
  const stylisAst = compile(stylisCss);
  return { rawCss, slots, stylisAst };
}

export function terminateStandaloneInterpolationStatements(css: string): string {
  let parenDepth = 0;
  const lines = css.split(/(?<=\n)/);
  const depthsBeforeLine: number[] = [];
  for (const line of lines) {
    depthsBeforeLine.push(parenDepth);
    parenDepth = updateParenDepth(parenDepth, line);
  }
  return lines
    .map((line, index) => {
      const lineForStylis =
        depthsBeforeLine[index] === 0 &&
        /^\s*__SC_EXPR_\d+__\s*$/.test(line) &&
        isBeforeAtRule(lines, index)
          ? line.replace(/(\s*)$/, ";$1")
          : line;
      return lineForStylis;
    })
    .join("");
}

function makeInterpolationPlaceholder(index: number): string {
  return `__SC_EXPR_${index}__`;
}

function isBeforeAtRule(lines: string[], startIndex: number): boolean {
  for (let i = startIndex + 1; i < lines.length; i++) {
    const trimmed = lines[i]!.trim();
    if (!trimmed || /^__SC_EXPR_\d+__\s*;?$/.test(trimmed)) {
      continue;
    }
    return trimmed.startsWith("@");
  }
  return false;
}

function updateParenDepth(startDepth: number, line: string): number {
  let depth = startDepth;
  let inString: false | '"' | "'" = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!;
    if ((ch === '"' || ch === "'") && line[i - 1] !== "\\") {
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
    } else if (ch === ")") {
      depth = Math.max(0, depth - 1);
    }
  }
  return depth;
}

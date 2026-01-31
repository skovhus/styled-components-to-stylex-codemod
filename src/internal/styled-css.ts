import type { Expression, TemplateLiteral } from "jscodeshift";
import { compile } from "stylis";
import type { Element } from "stylis";

export type StyledInterpolationSlot = {
  index: number;
  placeholder: string;
  expression: Expression;
  startOffset: number;
  endOffset: number;
};

export type ParsedStyledTemplate = {
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
  const stylisAst = compile(rawCss);
  return { rawCss, slots, stylisAst };
}

function makeInterpolationPlaceholder(index: number): string {
  return `__SC_EXPR_${index}__`;
}

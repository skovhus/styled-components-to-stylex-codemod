import valueParser from "postcss-value-parser";
import type { Node as ValueParserNode } from "postcss-value-parser";

export function splitCssValueWhitespace(raw: string): string[] {
  const parsed = valueParser(raw);
  return parsed.nodes
    .filter((node) => node.type !== "space")
    .map((node) => valueParser.stringify(node as ValueParserNode))
    .filter((value) => value !== "");
}

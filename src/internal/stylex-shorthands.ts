import valueParser from "postcss-value-parser";

export type DirectionalEntry = { prop: string; value: string };

type ValueParserNode = {
  type: string;
  value: string;
  nodes?: ValueParserNode[];
};

function printNode(node: ValueParserNode): string {
  switch (node.type) {
    case "word":
    case "string":
      return `${node.value}`;
    case "function":
      return `${node.value}(${node.nodes?.map(printNode).join("") ?? ""})`;
    default:
      return node.value;
  }
}

function areAllValuesSame(values: string[]): boolean {
  return values.length > 1 && values.every((value) => value === values[0]);
}

function expandQuadValues(values: string[]): [string, string, string, string] {
  const top = values[0] ?? "";
  const right = values[1] ?? top;
  const bottom = values[2] ?? top;
  const left = values[3] ?? right;
  return [top, right, bottom, left];
}

function splitDirectionalShorthands(rawValue: string | number, allowImportant = false): string[] {
  let processedValue: string | number = rawValue;
  if (rawValue === null || rawValue === undefined) {
    return [String(rawValue)];
  }
  if (typeof rawValue !== "string" && typeof rawValue !== "number") {
    return [String(rawValue)];
  }
  if (typeof rawValue === "number") {
    processedValue = String(rawValue);
  }
  if (typeof processedValue !== "string") {
    return [String(processedValue)];
  }
  const parsed = valueParser(processedValue.trim()) as unknown as { nodes?: ValueParserNode[] };
  const nodes = (parsed.nodes ?? [])
    .filter((node) => node.type !== "space" && node.type !== "div")
    .map(printNode);
  if (typeof rawValue === "number") {
    return nodes.map((node) => String(parseFloat(node)));
  }
  if (
    nodes.length > 1 &&
    nodes[nodes.length - 1]?.toLowerCase() === "!important" &&
    allowImportant
  ) {
    return nodes.slice(0, nodes.length - 1).map((node) => `${node} !important`);
  }
  if (areAllValuesSame(nodes)) {
    return [nodes[0]!];
  }
  return nodes;
}

export function splitDirectionalProperty(args: {
  prop: "padding" | "margin" | "scrollMargin";
  rawValue: string | number;
  important?: boolean;
  preferInline?: boolean;
  alwaysExpand?: boolean;
}): DirectionalEntry[] {
  const { prop, rawValue, important = false, preferInline = false, alwaysExpand = false } = args;
  const values = splitDirectionalShorthands(rawValue, false);
  const top = values[0] ?? "";
  const right = values[1] ?? top;
  const bottom = values[2] ?? top;
  const left = values[3] ?? right;
  const withImportant = (value: string): string => (important ? `${value} !important` : value);

  if (values.length === 1 && !important && !alwaysExpand) {
    return [{ prop, value: withImportant(top) }];
  }

  const quad = expandQuadValues(values);
  if (important) {
    return [
      { prop: `${prop}Top`, value: withImportant(quad[0]) },
      { prop: `${prop}Right`, value: withImportant(quad[1]) },
      { prop: `${prop}Bottom`, value: withImportant(quad[2]) },
      { prop: `${prop}Left`, value: withImportant(quad[3]) },
    ];
  }

  if (values.length === 2) {
    return [
      { prop: `${prop}Block`, value: withImportant(top) },
      { prop: `${prop}Inline`, value: withImportant(right) },
    ];
  }

  if (preferInline) {
    return [
      { prop: `${prop}Top`, value: withImportant(top) },
      { prop: `${prop}InlineEnd`, value: withImportant(right) },
      { prop: `${prop}Bottom`, value: withImportant(bottom) },
      { prop: `${prop}InlineStart`, value: withImportant(left) },
    ];
  }

  return [
    { prop: `${prop}Top`, value: withImportant(top) },
    { prop: `${prop}Right`, value: withImportant(right) },
    { prop: `${prop}Bottom`, value: withImportant(bottom) },
    { prop: `${prop}Left`, value: withImportant(left) },
  ];
}

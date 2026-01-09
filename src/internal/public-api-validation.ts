import type { Adapter } from "../adapter.js";

function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(
      value,
      (_k, v) => {
        if (typeof v === "function") {
          return "[Function]";
        }
        if (typeof v === "bigint") {
          return v.toString();
        }
        if (typeof v === "symbol") {
          return v.description ? `Symbol(${v.description})` : "Symbol()";
        }
        return v;
      },
      2,
    );
  } catch {
    return "[Unserializable value]";
  }
}

export function describeValue(value: unknown): string {
  if (value === null) {
    return "null";
  }
  if (value === undefined) {
    return "undefined";
  }
  if (Array.isArray(value)) {
    return `Array(${value.length}) ${safeStringify(value)}`;
  }
  if (typeof value === "string") {
    return JSON.stringify(value);
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  if (typeof value === "bigint") {
    return value.toString();
  }
  if (typeof value === "symbol") {
    return value.description ? `Symbol(${value.description})` : "Symbol()";
  }
  if (typeof value === "function") {
    return "[Function]";
  }
  return `${(value as any)?.constructor?.name ?? "Object"} ${safeStringify(value)}`;
}

export function assertValidAdapter(
  candidate: unknown,
  where: string,
): asserts candidate is Adapter {
  const obj = candidate as any;
  const resolveValue = obj?.resolveValue;
  const shouldSupportExternalStyles = obj?.shouldSupportExternalStyles;

  if (!candidate || typeof candidate !== "object") {
    throw new Error(
      [
        `[styled-components-to-stylex] ${where}: expected an adapter object.`,
        `Received: ${describeValue(candidate)}`,
        "",
        "Adapter shape:",
        "  {",
        "    resolveValue(context) { return { expr: string, imports: ImportSpec[] } | null }",
        "  }",
        "",
        "Example (plain JS):",
        '  import { defineAdapter } from "styled-components-to-stylex-codemod";',
        "  const adapter = defineAdapter({",
        "    resolveValue(ctx) {",
        "      return null; // return { expr, imports } to resolve theme/css vars/calls",
        "    },",
        "  });",
      ].join("\n"),
    );
  }

  if (typeof resolveValue !== "function") {
    throw new Error(
      [
        `[styled-components-to-stylex] ${where}: adapter.resolveValue must be a function.`,
        `Received: resolveValue=${describeValue(resolveValue)}`,
        "",
        "Adapter shape:",
        "  {",
        "    resolveValue(context) { return { expr: string, imports: ImportSpec[] } | null }",
        "  }",
      ].join("\n"),
    );
  }

  if (
    shouldSupportExternalStyles !== undefined &&
    typeof shouldSupportExternalStyles !== "function"
  ) {
    throw new Error(
      [
        `[styled-components-to-stylex] ${where}: adapter.shouldSupportExternalStyles must be a function when provided.`,
        `Received: shouldSupportExternalStyles=${describeValue(shouldSupportExternalStyles)}`,
      ].join("\n"),
    );
  }
}

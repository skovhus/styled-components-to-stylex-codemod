import type { Adapter } from "../adapter.js";

const REPO_URL = "https://github.com/skovhus/styled-components-to-stylex-codemod";
const ADAPTER_DOCS_URL = `${REPO_URL}#adapter`;

export function describeValue(value: unknown): string {
  if (value === null) {
    return "null";
  }
  if (value === undefined) {
    return "undefined";
  }
  if (Array.isArray(value)) {
    return `Array(${value.length})`;
  }
  if (typeof value === "string") {
    // Keep strings readable while still showing quotes.
    return `"${value}"`;
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
  if (typeof value === "object") {
    const ctor = (value as any)?.constructor?.name ?? "Object";
    let keys: string[] = [];
    try {
      keys = Object.keys(value as Record<string, unknown>);
    } catch {
      // ignore
    }
    const preview = keys.slice(0, 5).join(", ");
    const suffix = keys.length > 5 ? ", ..." : "";
    return keys.length ? `${ctor} { ${preview}${suffix} }` : ctor;
  }
  return "[Unknown]";
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
        "Adapter requirements:",
        "  - adapter.resolveValue(context) is required",
        "  - adapter.shouldSupportExternalStyles(context) is optional",
        "",
        "resolveValue(context) is called with one of these shapes:",
        '  - { kind: "theme", path }',
        '  - { kind: "cssVariable", name, fallback?, definedValue? }',
        '  - { kind: "call", callSiteFilePath, calleeImportedName, calleeSource, args }',
        "",
        `Docs/examples: ${ADAPTER_DOCS_URL}`,
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
        "",
        `Docs/examples: ${ADAPTER_DOCS_URL}`,
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

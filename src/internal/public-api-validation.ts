import type { Adapter } from "../adapter.js";

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
    const ctor = (value as { constructor?: { name?: string } })?.constructor?.name ?? "Object";
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
  const obj = candidate as Record<string, unknown>;
  const resolveValue = obj?.resolveValue;
  const resolveCall = obj?.resolveCall;
  const resolveSelector = obj?.resolveSelector;
  const externalInterface = obj?.externalInterface;

  if (!candidate || typeof candidate !== "object") {
    throw new Error(
      [
        `${where}: expected an adapter object.`,
        `Received: ${describeValue(candidate)}`,
        "",
        "Adapter requirements:",
        "  - adapter.resolveValue(context) is required",
        "  - adapter.resolveCall(context) is required",
        "  - adapter.resolveSelector(context) is required",
        "  - adapter.externalInterface(context) is required",
        "",
        "resolveValue(context) is called with one of these shapes:",
        '  - { kind: "theme", path }',
        '  - { kind: "cssVariable", name, fallback?, definedValue? }',
        '  - { kind: "importedValue", importedName, source, path? }',
        "",
        "resolveCall(context) is called with:",
        "  - { callSiteFilePath, calleeImportedName, calleeSource, args }",
        "",
        "resolveSelector(context) is called with:",
        '  - { kind: "selectorInterpolation", importedName, source, path? }',
        "",
        `Docs/examples: ${ADAPTER_DOCS_URL}`,
      ].join("\n"),
    );
  }

  if (typeof resolveValue !== "function") {
    throw new Error(
      [
        `${where}: adapter.resolveValue must be a function.`,
        `Received: resolveValue=${describeValue(resolveValue)}`,
        "",
        "Adapter shape:",
        "  {",
        "    resolveValue(context) {",
        "      // theme/cssVariable -> { expr, imports, dropDefinition? } | null",
        "    }",
        "    resolveCall(context) { return { expr, imports } | null }",
        "  }",
        "",
        `Docs/examples: ${ADAPTER_DOCS_URL}`,
      ].join("\n"),
    );
  }

  if (typeof resolveCall !== "function") {
    throw new Error(
      [
        `${where}: adapter.resolveCall must be a function.`,
        `Received: resolveCall=${describeValue(resolveCall)}`,
        "",
        "Adapter shape:",
        "  {",
        "    resolveCall(context) { return { expr: string, imports: ImportSpec[] } | null }",
        "  }",
        "",
        `Docs/examples: ${ADAPTER_DOCS_URL}`,
      ].join("\n"),
    );
  }

  if (typeof resolveSelector !== "function") {
    throw new Error(
      [
        `${where}: adapter.resolveSelector must be a function.`,
        `Received: resolveSelector=${describeValue(resolveSelector)}`,
        "",
        "Adapter shape:",
        "  {",
        '    resolveSelector(context) { return { kind: "media", expr: string, imports: ImportSpec[] } | undefined }',
        "  }",
        "",
        `Docs/examples: ${ADAPTER_DOCS_URL}`,
      ].join("\n"),
    );
  }

  if (typeof externalInterface !== "function") {
    throw new Error(
      [
        `${where}: adapter.externalInterface must be a function.`,
        `Received: externalInterface=${describeValue(externalInterface)}`,
      ].join("\n"),
    );
  }

  // Validate styleMerger config (null or object with functionName/importSource)
  const styleMerger = obj?.styleMerger;
  if (styleMerger !== null && styleMerger !== undefined) {
    if (typeof styleMerger !== "object") {
      throw new Error(
        [
          `${where}: adapter.styleMerger must be null or an object.`,
          `Received: styleMerger=${describeValue(styleMerger)}`,
          "",
          "Expected shape:",
          "  {",
          '    functionName: "stylexProps",',
          '    importSource: { kind: "specifier", value: "@company/ui-utils" }',
          "  }",
        ].join("\n"),
      );
    }

    const { functionName, importSource } = styleMerger as {
      functionName?: unknown;
      importSource?: unknown;
    };

    if (typeof functionName !== "string" || !functionName.trim()) {
      throw new Error(
        [
          `${where}: adapter.styleMerger.functionName must be a non-empty string.`,
          `Received: functionName=${describeValue(functionName)}`,
        ].join("\n"),
      );
    }

    if (!importSource || typeof importSource !== "object") {
      throw new Error(
        [
          `${where}: adapter.styleMerger.importSource must be an object.`,
          `Received: importSource=${describeValue(importSource)}`,
          "",
          "Expected shape:",
          '  { kind: "specifier", value: "@company/ui-utils" }',
          "  or",
          '  { kind: "absolutePath", value: "/path/to/module.ts" }',
        ].join("\n"),
      );
    }

    const { kind, value } = importSource as { kind?: unknown; value?: unknown };
    if (kind !== "specifier" && kind !== "absolutePath") {
      throw new Error(
        [
          `${where}: adapter.styleMerger.importSource.kind must be "specifier" or "absolutePath".`,
          `Received: kind=${describeValue(kind)}`,
        ].join("\n"),
      );
    }

    if (typeof value !== "string" || !value.trim()) {
      throw new Error(
        [
          `${where}: adapter.styleMerger.importSource.value must be a non-empty string.`,
          `Received: value=${describeValue(value)}`,
        ].join("\n"),
      );
    }
  }
}

const REPO_URL = "https://github.com/skovhus/styled-components-to-stylex-codemod";
const ADAPTER_DOCS_URL = `${REPO_URL}#adapter`;

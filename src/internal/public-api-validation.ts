/**
 * Validates adapter/public API inputs and formats errors.
 * Core concepts: shape checks and readable diagnostics.
 */
import type { Adapter, AdapterInput } from "../adapter.js";

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

/** Validates that the candidate is a fully-resolved `Adapter` (externalInterface must be a function). */
export function assertValidAdapter(
  candidate: unknown,
  where: string,
): asserts candidate is Adapter {
  assertAdapterShape(candidate, where, false);
}

/** Validates that the candidate is a valid `AdapterInput` (externalInterface may be `"auto"` or a function). */
export function assertValidAdapterInput(
  candidate: unknown,
  where: string,
): asserts candidate is AdapterInput {
  assertAdapterShape(candidate, where, true);
}

function assertAdapterShape(candidate: unknown, where: string, allowAutoExtIf: boolean): void {
  const obj = candidate as Record<string, unknown>;
  const resolveValue = obj?.resolveValue;
  const resolveCall = obj?.resolveCall;
  const resolveSelector = obj?.resolveSelector;
  const resolveBaseComponent = obj?.resolveBaseComponent;
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
        '    resolveSelector(context) { return { kind: "media" | "pseudoAlias" | "pseudoExpand", ... } | undefined }',
        "  }",
        "",
        `Docs/examples: ${ADAPTER_DOCS_URL}`,
      ].join("\n"),
    );
  }

  if (resolveBaseComponent !== undefined && typeof resolveBaseComponent !== "function") {
    throw new Error(
      [
        `${where}: adapter.resolveBaseComponent must be a function when provided.`,
        `Received: resolveBaseComponent=${describeValue(resolveBaseComponent)}`,
        "",
        "Adapter shape:",
        "  {",
        "    resolveBaseComponent(context) {",
        "      return { tagName, consumedProps, sx?, mixins? } | undefined",
        "    }",
        "  }",
        "",
        `Docs/examples: ${ADAPTER_DOCS_URL}`,
      ].join("\n"),
    );
  }

  const isValidExtIf =
    typeof externalInterface === "function" || (allowAutoExtIf && externalInterface === "auto");
  if (!isValidExtIf) {
    const expected = allowAutoExtIf
      ? 'adapter.externalInterface must be a function or "auto".'
      : "adapter.externalInterface must be a function.";
    throw new Error(
      [
        `${where}: ${expected}`,
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
    assertFunctionNameAndImportSource({
      where,
      configPath: "adapter.styleMerger",
      functionName,
      importSource,
      specifierExample: "@company/ui-utils",
      absolutePathExample: "/path/to/module.ts",
    });
  }

  // Validate markerFile (optional function)
  const markerFile = obj?.markerFile;
  if (markerFile !== undefined && markerFile !== null && typeof markerFile !== "function") {
    throw new Error(
      [
        `${where}: adapter.markerFile must be a function when provided.`,
        `Received: markerFile=${describeValue(markerFile)}`,
        "",
        "Expected signature:",
        '  markerFile(ctx: { filePath: string }) => { kind: "specifier" | "absolutePath", value: string }',
      ].join("\n"),
    );
  }

  // Validate declarative mappings (optional arrays of [pattern, entry] tuples)
  const themeMapping = obj?.themeMapping;
  if (themeMapping !== undefined && themeMapping !== null) {
    assertThemeMapping(themeMapping, where);
  }
  assertOptionalTupleArray(obj?.cssVariableMapping, "cssVariableMapping", where, true);
  assertOptionalTupleArray(obj?.callMapping, "callMapping", where, false);
  assertOptionalTupleArray(obj?.selectorMapping, "selectorMapping", where, false);

  // Validate themeHook config (null/undefined or object with functionName/importSource)
  const themeHook = obj?.themeHook;
  if (themeHook !== null && themeHook !== undefined) {
    if (typeof themeHook !== "object") {
      throw new Error(
        [
          `${where}: adapter.themeHook must be an object when provided.`,
          `Received: themeHook=${describeValue(themeHook)}`,
          "",
          "Expected shape:",
          "  {",
          '    functionName: "useTheme",',
          '    importSource: { kind: "specifier", value: "@company/theme-hooks" }',
          "  }",
        ].join("\n"),
      );
    }

    const { functionName, importSource } = themeHook as {
      functionName?: unknown;
      importSource?: unknown;
    };
    assertFunctionNameAndImportSource({
      where,
      configPath: "adapter.themeHook",
      functionName,
      importSource,
      specifierExample: "@company/theme-hooks",
      absolutePathExample: "/path/to/theme-hooks.ts",
    });
  }
}

function assertFunctionNameAndImportSource(args: {
  where: string;
  configPath: string;
  functionName: unknown;
  importSource: unknown;
  specifierExample: string;
  absolutePathExample: string;
}): void {
  const { where, configPath, functionName, importSource, specifierExample, absolutePathExample } =
    args;

  if (typeof functionName !== "string" || !functionName.trim()) {
    throw new Error(
      [
        `${where}: ${configPath}.functionName must be a non-empty string.`,
        `Received: functionName=${describeValue(functionName)}`,
      ].join("\n"),
    );
  }

  if (!importSource || typeof importSource !== "object") {
    throw new Error(
      [
        `${where}: ${configPath}.importSource must be an object.`,
        `Received: importSource=${describeValue(importSource)}`,
        "",
        "Expected shape:",
        `  { kind: "specifier", value: "${specifierExample}" }`,
        "  or",
        `  { kind: "absolutePath", value: "${absolutePathExample}" }`,
      ].join("\n"),
    );
  }

  const { kind, value } = importSource as { kind?: unknown; value?: unknown };
  if (kind !== "specifier" && kind !== "absolutePath") {
    throw new Error(
      [
        `${where}: ${configPath}.importSource.kind must be "specifier" or "absolutePath".`,
        `Received: kind=${describeValue(kind)}`,
      ].join("\n"),
    );
  }

  if (typeof value !== "string" || !value.trim()) {
    throw new Error(
      [
        `${where}: ${configPath}.importSource.value must be a non-empty string.`,
        `Received: value=${describeValue(value)}`,
      ].join("\n"),
    );
  }
}

function assertThemeMapping(value: unknown, where: string): void {
  if (!Array.isArray(value)) {
    throw new Error(
      [
        `${where}: adapter.themeMapping must be an array of [pattern, entry] tuples.`,
        `Received: themeMapping=${describeValue(value)}`,
      ].join("\n"),
    );
  }
  for (let i = 0; i < value.length; i++) {
    const tuple = value[i];
    if (!Array.isArray(tuple) || tuple.length !== 2) {
      throw new Error(`${where}: adapter.themeMapping[${i}] must be a [pattern, entry] tuple.`);
    }
    const [pattern, entry] = tuple as [unknown, unknown];
    if (typeof pattern !== "string" || !pattern.trim()) {
      throw new Error(
        `${where}: adapter.themeMapping[${i}][0] (pattern) must be a non-empty string.`,
      );
    }
    if (!entry || typeof entry !== "object") {
      throw new Error(`${where}: adapter.themeMapping[${i}][1] (entry) must be an object.`);
    }
    const e = entry as Record<string, unknown>;
    // Validate entry shape: must be one of bail, directional, or resolve
    const hasBail = "bail" in e;
    const hasDirectional = "directional" in e;
    const hasExpr = "expr" in e;
    if (!hasBail && !hasDirectional && !hasExpr) {
      throw new Error(
        [
          `${where}: adapter.themeMapping[${i}][1] must have "bail", "directional", or "expr".`,
          `Received: ${describeValue(entry)}`,
        ].join("\n"),
      );
    }
    if (hasExpr && typeof e.expr !== "string") {
      throw new Error(`${where}: adapter.themeMapping[${i}][1].expr must be a string.`);
    }
  }
}

/** Validate that an optional mapping field is an array of [string, entry] tuples. */
function assertOptionalTupleArray(
  value: unknown,
  fieldName: string,
  where: string,
  allowFunctionEntries: boolean,
): void {
  if (value === undefined || value === null) {
    return;
  }
  if (!Array.isArray(value)) {
    throw new Error(
      `${where}: adapter.${fieldName} must be an array of [pattern, entry] tuples. Received: ${describeValue(value)}`,
    );
  }
  for (let i = 0; i < value.length; i++) {
    const item = value[i];
    if (!Array.isArray(item) || item.length < 2) {
      throw new Error(`${where}: adapter.${fieldName}[${i}] must be a [pattern, entry] tuple.`);
    }
    if (typeof item[0] !== "string" || !item[0].trim()) {
      throw new Error(
        `${where}: adapter.${fieldName}[${i}][0] (pattern) must be a non-empty string.`,
      );
    }
    const entry = item[1];
    if (typeof entry === "function") {
      if (!allowFunctionEntries) {
        throw new Error(
          `${where}: adapter.${fieldName}[${i}][1] (entry) must be an object, not a function. Only cssVariableMapping supports function entries.`,
        );
      }
    } else if (!entry || typeof entry !== "object") {
      const expected = allowFunctionEntries ? "an object or function" : "an object";
      throw new Error(`${where}: adapter.${fieldName}[${i}][1] (entry) must be ${expected}.`);
    }
  }
}

const REPO_URL = "https://github.com/skovhus/styled-components-to-stylex-codemod";
const ADAPTER_DOCS_URL = `${REPO_URL}#adapter`;

/**
 * Resolves local `.stylex` imports whose exported values are proven numeric.
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, isAbsolute, join } from "node:path";
import type { API } from "jscodeshift";

import type { ImportSource } from "../../adapter.js";
import { isStylexImportSource } from "./stylex-import-source.js";

type JSCodeshift = API["jscodeshift"];

export type StylexImportBinding = {
  localName: string;
  importedName: string;
  source: ImportSource;
};

export function collectNumericStylexImportBindings(args: {
  j: JSCodeshift;
  filePath: string;
  bindings: Iterable<StylexImportBinding>;
}): Set<string> {
  const identifiers = new Set<string>();
  const exportCache = new Map<string, ReadonlySet<string>>();
  for (const binding of args.bindings) {
    if (!isStylexImportSource(binding.source.value)) {
      continue;
    }
    const cacheKey = `${binding.source.kind}\0${binding.source.value}`;
    let numericExports = exportCache.get(cacheKey);
    if (!numericExports) {
      numericExports = collectNumericStylexExportNames(args.j, args.filePath, binding.source);
      exportCache.set(cacheKey, numericExports);
    }
    if (numericExports.has(binding.importedName)) {
      identifiers.add(binding.localName);
    }
  }
  return identifiers;
}

function resolveStylexImportFile(filePath: string, source: ImportSource): string | null {
  const sourceValue = source.value;
  if (!isStylexImportSource(sourceValue)) {
    return null;
  }
  if (source.kind === "specifier" && !sourceValue.startsWith(".")) {
    return null;
  }
  const basePath =
    source.kind === "absolutePath" || isAbsolute(sourceValue)
      ? sourceValue
      : join(dirname(filePath), sourceValue);
  const candidates = /\.[cm]?[jt]sx?$/.test(basePath)
    ? [basePath]
    : [`${basePath}.ts`, `${basePath}.tsx`, `${basePath}.js`, `${basePath}.jsx`];
  return candidates.find((candidate) => existsSync(candidate)) ?? null;
}

function collectNumericStylexExportNames(
  j: JSCodeshift,
  filePath: string,
  source: ImportSource,
): ReadonlySet<string> {
  const resolvedPath = resolveStylexImportFile(filePath, source);
  if (!resolvedPath) {
    return new Set();
  }
  let root: ReturnType<JSCodeshift>;
  try {
    root = j(readFileSync(resolvedPath, "utf8"));
  } catch {
    return new Set();
  }
  const localNumericBindings = new Map<string, boolean>();
  const exportedNumericNames = new Set<string>();
  root.find(j.VariableDeclarator).forEach((path) => {
    if (!isImmutableTopLevelVariableDeclaratorPath(path)) {
      return;
    }
    const id = path.node.id as { type?: string; name?: string } | null | undefined;
    if (id?.type !== "Identifier" || !id.name) {
      return;
    }
    localNumericBindings.set(id.name, isNumericStylexExportValue(path.node.init));
  });
  root.find(j.ExportNamedDeclaration).forEach((path) => {
    const declaration = path.node.declaration;
    if (declaration?.type === "VariableDeclaration") {
      const variableDeclaration = declaration as {
        declarations?: Array<{ id?: unknown; init?: unknown }>;
      };
      for (const decl of variableDeclaration.declarations ?? []) {
        const id = decl.id as { type?: string; name?: string } | null | undefined;
        if (id?.type === "Identifier" && id.name && isNumericStylexExportValue(decl.init)) {
          exportedNumericNames.add(id.name);
        }
      }
    }
    for (const specifier of path.node.specifiers ?? []) {
      const localName = exportSpecifierLocalName(specifier);
      const exportedName = exportSpecifierExportedName(specifier);
      if (localName && exportedName && localNumericBindings.get(localName) === true) {
        exportedNumericNames.add(exportedName);
      }
    }
  });
  root.find(j.ExportDefaultDeclaration).forEach((path) => {
    if (isNumericStylexExportValue(path.node.declaration)) {
      exportedNumericNames.add("default");
    }
  });
  return exportedNumericNames;
}

function exportSpecifierLocalName(specifier: unknown): string | null {
  return (
    (specifier as { local?: { name?: string; value?: string } | null }).local?.name ??
    (specifier as { local?: { name?: string; value?: string } | null }).local?.value ??
    null
  );
}

function exportSpecifierExportedName(specifier: unknown): string | null {
  return (
    (specifier as { exported?: { name?: string; value?: string } | null }).exported?.name ??
    (specifier as { exported?: { name?: string; value?: string } | null }).exported?.value ??
    null
  );
}

function isNumericStylexExportValue(value: unknown): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const node = value as {
    type?: string;
    value?: unknown;
    operator?: string;
    argument?: unknown;
    expression?: unknown;
    callee?: unknown;
    arguments?: unknown[];
    properties?: unknown[];
  };
  if (
    node.type === "NumericLiteral" ||
    (node.type === "Literal" && typeof node.value === "number")
  ) {
    return true;
  }
  if (node.type === "UnaryExpression") {
    return (
      (node.operator === "-" || node.operator === "+") && isNumericStylexExportValue(node.argument)
    );
  }
  if (
    node.type === "TSAsExpression" ||
    node.type === "TSSatisfiesExpression" ||
    node.type === "TSNonNullExpression" ||
    node.type === "ParenthesizedExpression"
  ) {
    return isNumericStylexExportValue(node.expression);
  }
  if (node.type === "CallExpression" && isStylexDefineConstsCall(node.callee)) {
    return isNumericStylexExportValue(node.arguments?.[0]);
  }
  if (node.type !== "ObjectExpression" || !Array.isArray(node.properties)) {
    return false;
  }
  return node.properties.every((property) => {
    if (!property || typeof property !== "object" || Array.isArray(property)) {
      return false;
    }
    const prop = property as { type?: string; value?: unknown };
    return (
      (prop.type === "Property" || prop.type === "ObjectProperty") &&
      isNumericStylexExportValue(prop.value)
    );
  });
}

function isStylexDefineConstsCall(callee: unknown): boolean {
  if (!callee || typeof callee !== "object" || Array.isArray(callee)) {
    return false;
  }
  const node = callee as {
    type?: string;
    name?: string;
    property?: { type?: string; name?: string };
    computed?: boolean;
  };
  if (node.type === "Identifier") {
    return node.name === "defineConsts";
  }
  return (
    node.type === "MemberExpression" &&
    node.computed !== true &&
    node.property?.type === "Identifier" &&
    node.property.name === "defineConsts"
  );
}

/**
 * Whether a VariableDeclarator path is a `const` declared at module top level
 * (not nested inside a function or class), i.e. a binding safe to treat as
 * immutable for static resolution.
 */
export function isImmutableTopLevelVariableDeclaratorPath(path: { parentPath?: unknown }): boolean {
  const declaration = (path.parentPath as { node?: { type?: string; kind?: string } } | undefined)
    ?.node;
  if (declaration?.type !== "VariableDeclaration" || declaration.kind !== "const") {
    return false;
  }
  let current: unknown = path.parentPath;
  while (current && typeof current === "object") {
    const node = (current as { node?: { type?: string } }).node;
    if (node?.type === "Program") {
      return true;
    }
    if (
      node?.type === "FunctionDeclaration" ||
      node?.type === "FunctionExpression" ||
      node?.type === "ArrowFunctionExpression" ||
      node?.type === "ClassDeclaration" ||
      node?.type === "ClassExpression"
    ) {
      return false;
    }
    current = (current as { parentPath?: unknown }).parentPath;
  }
  return false;
}

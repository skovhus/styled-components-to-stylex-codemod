/**
 * Step: build a map of local identifiers to their import sources.
 * Core concepts: identifier mapping and file-relative import resolution.
 */
import { createRequire } from "node:module";
import { dirname, resolve as pathResolve } from "node:path";
import type { ASTNode, Collection, JSCodeshift } from "jscodeshift";
import type { ImportSource } from "../../adapter.js";
import { CONTINUE, type StepResult } from "../transform-types.js";
import { TransformContext } from "../transform-context.js";
import { isRelativeSpecifier } from "../utilities/path-utils.js";

export function buildImportMapStep(ctx: TransformContext): StepResult {
  ctx.importMap = buildImportMap({
    root: ctx.root,
    j: ctx.j,
    filePath: ctx.file.path,
    resolveModule: ctx.options.resolveModule,
  });
  return CONTINUE;
}

// --- Non-exported helpers ---

function buildImportMap(args: {
  root: Collection<ASTNode>;
  j: JSCodeshift;
  filePath: string;
  resolveModule?: (fromFile: string, specifier: string) => string | undefined;
}): Map<string, { importedName: string; source: ImportSource }> {
  const { root, j, filePath, resolveModule } = args;
  const importMap = new Map<string, { importedName: string; source: ImportSource }>();
  const baseDir = dirname(filePath);

  root.find(j.ImportDeclaration).forEach((p) => {
    const source = p.node.source?.value;
    if (typeof source !== "string") {
      return;
    }
    const resolvedSource = resolveImportSource(source, baseDir, filePath, resolveModule);
    for (const s of p.node.specifiers ?? []) {
      if (!s) {
        continue;
      }
      if (s.type === "ImportDefaultSpecifier") {
        const localName = s.local?.type === "Identifier" ? s.local.name : undefined;
        if (localName) {
          importMap.set(localName, { importedName: "default", source: resolvedSource });
        }
        continue;
      }
      if (s.type === "ImportNamespaceSpecifier") {
        const localName = s.local?.type === "Identifier" ? s.local.name : undefined;
        if (localName) {
          importMap.set(localName, { importedName: "*", source: resolvedSource });
        }
        continue;
      }
      if (s.type !== "ImportSpecifier") {
        continue;
      }
      const importedNode = s.imported as { type?: string; name?: string; value?: unknown };
      const importedName =
        importedNode.type === "Identifier"
          ? importedNode.name
          : (importedNode.type === "StringLiteral" || importedNode.type === "Literal") &&
              typeof importedNode.value === "string"
            ? importedNode.value
            : undefined;
      const localName =
        s.local?.type === "Identifier"
          ? s.local.name
          : s.imported?.type === "Identifier"
            ? s.imported.name
            : undefined;
      if (!localName || !importedName) {
        continue;
      }
      importMap.set(localName, { importedName, source: resolvedSource });
    }
  });

  return importMap;
}

function resolveImportSource(
  specifier: string,
  baseDir: string,
  filePath: string,
  resolveModule?: (fromFile: string, specifier: string) => string | undefined,
): ImportSource {
  if (!isRelativeSpecifier(specifier)) {
    if (isResolvablePackageSpecifier(specifier, filePath)) {
      return { kind: "specifier", value: specifier };
    }
    const resolved = resolveModule?.(filePath, specifier);
    return resolved
      ? { kind: "absolutePath", value: resolved }
      : { kind: "specifier", value: specifier };
  }

  return {
    kind: "absolutePath",
    value: resolveModule?.(filePath, specifier) ?? pathResolve(baseDir, specifier),
  };
}

function isResolvablePackageSpecifier(specifier: string, filePath: string): boolean {
  const packageName = packageNameFromSpecifier(specifier);
  if (!packageName) {
    return false;
  }

  const requireFromFile = createRequire(pathResolve(filePath));
  try {
    requireFromFile.resolve(`${packageName}/package.json`);
    return true;
  } catch {
    try {
      requireFromFile.resolve(packageName);
      return true;
    } catch {
      return false;
    }
  }
}

function packageNameFromSpecifier(specifier: string): string | null {
  if (specifier.startsWith("#")) {
    return null;
  }

  const parts = specifier.split("/");
  const first = parts[0];
  if (!first) {
    return null;
  }

  if (first.startsWith("@")) {
    const second = parts[1];
    return second ? `${first}/${second}` : null;
  }
  return first;
}

/**
 * Step: build a map of local identifiers to their import sources.
 * Core concepts: identifier mapping and file-relative import resolution.
 */
import { dirname, resolve as pathResolve } from "node:path";
import type { ASTNode, Collection, JSCodeshift } from "jscodeshift";
import type { ImportSource } from "../../adapter.js";
import { CONTINUE, type StepResult } from "../transform-types.js";
import { TransformContext } from "../transform-context.js";

export function buildImportMapStep(ctx: TransformContext): StepResult {
  ctx.importMap = buildImportMap({ root: ctx.root, j: ctx.j, filePath: ctx.file.path });
  return CONTINUE;
}

// --- Non-exported helpers ---

function buildImportMap(args: {
  root: Collection<ASTNode>;
  j: JSCodeshift;
  filePath: string;
}): Map<string, { importedName: string; source: ImportSource }> {
  const { root, j, filePath } = args;
  const importMap = new Map<string, { importedName: string; source: ImportSource }>();
  const baseDir = dirname(filePath);

  root.find(j.ImportDeclaration).forEach((p) => {
    const source = p.node.source?.value;
    if (typeof source !== "string") {
      return;
    }
    const resolvedSource = resolveImportSource(source, baseDir);
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

/**
 * Deterministic resolution: relative specifiers resolve against the current
 * file's directory. This intentionally does NOT probe extensions, consult
 * tsconfig paths, or use Node resolution.
 */
function resolveImportSource(specifier: string, baseDir: string): ImportSource {
  const isRelative =
    specifier === "." ||
    specifier === ".." ||
    specifier.startsWith("./") ||
    specifier.startsWith("../") ||
    specifier.startsWith(".\\") ||
    specifier.startsWith("..\\");
  return isRelative
    ? { kind: "absolutePath", value: pathResolve(baseDir, specifier) }
    : { kind: "specifier", value: specifier };
}

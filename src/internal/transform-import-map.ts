import { dirname, resolve as pathResolve } from "node:path";
import type { ImportSource } from "../adapter.js";

export function buildImportMap(args: { root: any; j: any; filePath: string }): Map<
  string,
  {
    importedName: string;
    source: ImportSource;
  }
> {
  const { root, j, filePath } = args;
  const importMap = new Map<
    string,
    {
      importedName: string;
      source: ImportSource;
    }
  >();

  const baseDir = dirname(filePath);
  const resolveImportSource = (specifier: string): ImportSource => {
    // Deterministic resolution: for relative specifiers, just resolve against the current file’s folder.
    // This intentionally does NOT probe extensions, consult tsconfig paths, or use Node resolution.
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
  };

  root.find(j.ImportDeclaration).forEach((p: any) => {
    const source = p.node.source?.value;
    if (typeof source !== "string") {
      return;
    }
    const resolvedSource = resolveImportSource(source);
    const specs = p.node.specifiers ?? [];
    for (const s of specs) {
      if (!s) {
        continue;
      }
      if (s.type === "ImportSpecifier") {
        const importedName =
          s.imported?.type === "Identifier"
            ? s.imported.name
            : s.imported?.type === "Literal" && typeof s.imported.value === "string"
              ? s.imported.value
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
        importMap.set(localName, {
          importedName,
          source: resolvedSource,
        });
      }
    }
  });

  return importMap;
}

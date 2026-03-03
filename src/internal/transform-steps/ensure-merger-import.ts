/**
 * Step: ensure style merger import exists when referenced.
 * Core concepts: identifier usage scanning and import injection.
 */
import path from "node:path";
import { POLYMORPHIC_TYPE_NAME, type ImportSource } from "../../adapter.js";
import { CONTINUE, type StepResult } from "../transform-types.js";
import { TransformContext } from "../transform-context.js";

/**
 * Ensures the style merger import and polymorphic type import are present when referenced.
 */
export function ensureMergerImportStep(ctx: TransformContext): StepResult {
  const { root, j, adapter } = ctx;

  // Ensure the style merger import is present whenever the merger function is actually called.
  // We intentionally key this off call expressions (not identifier-name matches) so local
  // bindings with the same name do not cause false-positive imports.
  if (adapter.styleMerger?.functionName && adapter.styleMerger.importSource) {
    const mergerName = adapter.styleMerger.functionName;
    const hasMergerCall =
      root
        .find(j.CallExpression, {
          callee: { type: "Identifier", name: mergerName },
        } as any)
        .size() > 0;
    const hasMergerImportBinding =
      root
        .find(j.ImportDeclaration)
        .filter((p: any) =>
          ((p.node.specifiers ?? []) as any[]).some((s: any) => {
            if (s?.type !== "ImportSpecifier") {
              return false;
            }
            return s.local?.type === "Identifier" && s.local.name === mergerName;
          }),
        )
        .size() > 0;
    const hasTopLevelBinding = hasTopLevelValueBinding(root, mergerName);

    if (hasMergerCall && !hasMergerImportBinding && !hasTopLevelBinding) {
      insertImportAfterStylex(ctx, adapter.styleMerger.importSource, mergerName, false);
    }
  }

  // Ensure the polymorphic type helper import is present when referenced in type annotations.
  if (adapter.polymorphicHelper) {
    const typeName = POLYMORPHIC_TYPE_NAME;
    const hasTypeRef =
      root
        .find(j.TSTypeReference, {
          typeName: { type: "Identifier", name: typeName },
        } as any)
        .size() > 0;
    const hasImportBinding =
      root
        .find(j.ImportDeclaration)
        .filter((p: any) =>
          ((p.node.specifiers ?? []) as any[]).some((s: any) => {
            if (s?.type !== "ImportSpecifier") {
              return false;
            }
            return s.local?.type === "Identifier" && s.local.name === typeName;
          }),
        )
        .size() > 0;
    const hasTopLevel = hasTopLevelValueBinding(root, typeName);

    if (hasTypeRef && !hasImportBinding && !hasTopLevel) {
      const source = adapter.polymorphicHelper;
      // For absolutePath sources, strip .ts/.d.ts extension for the import specifier
      const importSource: ImportSource =
        source.kind === "absolutePath"
          ? {
              kind: "absolutePath",
              value: source.value.replace(/\.d\.ts$/, "").replace(/\.tsx?$/, ""),
            }
          : source;
      insertImportAfterStylex(ctx, importSource, typeName, true);
    }
  }

  return CONTINUE;
}

/** Insert an import declaration after the stylex import (or at the top of the file). */
function insertImportAfterStylex(
  ctx: TransformContext,
  importSource: ImportSource,
  localName: string,
  isTypeOnly: boolean,
): void {
  const { root, j, file } = ctx;
  const moduleSpecifier = toModuleSpecifier(importSource, file.path);
  const specifier = j.importSpecifier(j.identifier(localName));
  const decl = j.importDeclaration([specifier], j.literal(moduleSpecifier));
  if (isTypeOnly) {
    (decl as any).importKind = "type";
  }
  const stylexImport = root.find(j.ImportDeclaration, {
    source: { value: "@stylexjs/stylex" },
  } as any);
  if (stylexImport.size() > 0) {
    stylexImport.at(stylexImport.size() - 1).insertAfter(decl);
  } else {
    const firstImport = root.find(j.ImportDeclaration).at(0);
    if (firstImport.size() > 0) {
      firstImport.insertBefore(decl);
    } else {
      root.get().node.program.body.unshift(decl);
    }
  }
  ctx.markChanged();
}

function toModuleSpecifier(from: ImportSource, filePath: string): string {
  if (from.kind === "specifier") {
    if (typeof from.value !== "string" || from.value.trim() === "") {
      throw new Error(
        `Invalid styleMerger import specifier: expected non-empty string, got ${JSON.stringify(
          from.value,
        )}`,
      );
    }
    return from.value;
  }

  if (typeof from.value !== "string" || from.value.trim() === "") {
    throw new Error(
      `Invalid styleMerger import absolutePath: expected non-empty string, got ${JSON.stringify(
        from.value,
      )}`,
    );
  }
  if (!path.isAbsolute(from.value)) {
    throw new Error(
      `Invalid styleMerger import absolutePath: expected absolute path, got ${JSON.stringify(
        from.value,
      )}`,
    );
  }

  const baseDir = path.dirname(String(filePath));
  let rel = path.relative(baseDir, from.value);
  rel = rel.split(path.sep).join("/");
  if (!rel.startsWith(".")) {
    rel = `./${rel}`;
  }
  return rel;
}

function hasTopLevelValueBinding(root: any, localName: string): boolean {
  const body = root.get().node.program.body as any[];
  const hasBindingInDeclaration = (decl: any): boolean => {
    if (!decl || typeof decl !== "object") {
      return false;
    }
    if (
      (decl.type === "FunctionDeclaration" || decl.type === "ClassDeclaration") &&
      decl.id?.type === "Identifier" &&
      decl.id.name === localName
    ) {
      return true;
    }
    if (decl.type === "VariableDeclaration") {
      return (decl.declarations ?? []).some(
        (d: any) => d?.id?.type === "Identifier" && d.id.name === localName,
      );
    }
    return false;
  };

  for (const stmt of body) {
    if (hasBindingInDeclaration(stmt)) {
      return true;
    }
    if (stmt?.type === "ExportNamedDeclaration" || stmt?.type === "ExportDefaultDeclaration") {
      if (hasBindingInDeclaration(stmt.declaration)) {
        return true;
      }
    }
  }
  return false;
}

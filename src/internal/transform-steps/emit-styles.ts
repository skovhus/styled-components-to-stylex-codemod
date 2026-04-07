/**
 * Step: emit stylex.create objects and resolver imports.
 * Core concepts: style emission and import aliasing.
 */
import { basename, dirname, join, relative, sep } from "node:path";
import type { ImportSource } from "../../adapter.js";
import { emitStylesAndImports } from "../emit-styles.js";
import { CONTINUE, type StepResult } from "../transform-types.js";
import { TransformContext } from "../transform-context.js";

/**
 * Emits stylex.create objects and required imports, applying resolver import aliasing.
 */
export function emitStylesStep(ctx: TransformContext): StepResult {
  if (!ctx.styledDecls || !ctx.styledImports) {
    return CONTINUE;
  }

  const { emptyStyleKeys } = emitStylesAndImports(ctx);
  ctx.emptyStyleKeys = emptyStyleKeys;
  ctx.markChanged();

  // Emit defineMarker() declarations for cross-file parent components
  if (ctx.crossFileMarkers && ctx.crossFileMarkers.size > 0) {
    emitDefineMarkerDeclarations(ctx, ctx.crossFileMarkers);
  }

  if (ctx.resolverImportAliases && ctx.resolverImportAliases.size > 0) {
    const renameIdentifier = (node: any, parent: any): void => {
      if (!node || typeof node !== "object") {
        return;
      }
      if (Array.isArray(node)) {
        for (const child of node) {
          renameIdentifier(child, parent);
        }
        return;
      }

      if (node.type === "Identifier") {
        const alias = ctx.resolverImportAliases?.get(node.name);
        if (alias) {
          const parentNode = parent ?? null;
          const isMemberProp =
            parentNode &&
            (parentNode.type === "MemberExpression" ||
              parentNode.type === "OptionalMemberExpression") &&
            parentNode.property === node &&
            parentNode.computed === false;
          const isObjectKey =
            parentNode &&
            parentNode.type === "Property" &&
            parentNode.key === node &&
            parentNode.shorthand !== true;
          const isImport =
            parentNode &&
            (parentNode.type === "ImportSpecifier" ||
              parentNode.type === "ImportDefaultSpecifier" ||
              parentNode.type === "ImportNamespaceSpecifier");
          if (!isMemberProp && !isObjectKey && !isImport) {
            node.name = alias;
          }
        }
      }

      for (const key of Object.keys(node)) {
        if (key === "loc" || key === "comments") {
          continue;
        }
        const child = (node as any)[key];
        if (child && typeof child === "object") {
          renameIdentifier(child, node);
        }
      }
    };

    ctx.root
      .find(ctx.j.CallExpression, {
        callee: {
          type: "MemberExpression",
          object: { type: "Identifier", name: "stylex" },
          property: { type: "Identifier", name: "create" },
        },
      } as any)
      .forEach((p: any) => {
        const args = p.node.arguments ?? [];
        if (args[0]) {
          renameIdentifier(args[0], null);
        }
      });
  }

  return CONTINUE;
}

// --- Non-exported helpers ---

/**
 * Emit defineMarker declarations into a sidecar `.stylex.ts` file and insert
 * an import for the markers into the main file. StyleX requires defineMarker()
 * to live in `.stylex.ts` files for the babel plugin's `fileNameForHashing`.
 */
function emitDefineMarkerDeclarations(
  ctx: TransformContext,
  crossFileMarkers: Map<string, string>,
): void {
  const j = ctx.j;
  const markerNames = [...crossFileMarkers.values()];

  // Build sidecar file content with JSDoc comments for each marker
  const markerDecls = markerNames
    .map((name) => {
      const componentName = name.replace(/Marker$/, "");
      return `/** Custom marker for ${componentName} */\nexport const ${name} = stylex.defineMarker();`;
    })
    .join("\n\n");
  ctx.sidecarStylexContent = `import * as stylex from "@stylexjs/stylex";\n\n${markerDecls}\n`;

  // Use adapter.markerFile only when at least one marker is truly cross-file.
  // Internal-only markers (sibling selectors within the same file) use the default
  // local sidecar so they don't pollute a shared marker file.
  let sidecarImportPath: string;
  const adapterMarkerFile = ctx.hasCrossFileMarkerRelations ? ctx.adapter.markerFile : undefined;
  const importSource = adapterMarkerFile?.({ filePath: ctx.file.path });
  if (importSource) {
    sidecarImportPath = importSourceToModuleSpecifier(importSource, ctx.file.path);
    ctx.sidecarFilePath = importSourceToAbsolutePath(importSource, ctx.file.path);
  } else {
    const fileBase = basename(ctx.file.path).replace(/\.\w+$/, "");
    sidecarImportPath = `./${fileBase}.stylex`;
  }

  // Insert `import { XMarker, ... } from "./file.stylex"` after existing imports
  const importDecl = j.importDeclaration(
    markerNames.map((name) => j.importSpecifier(j.identifier(name))),
    j.literal(sidecarImportPath),
  );

  const programBody = ctx.root.get().node.program.body as Array<{ type?: string }>;
  const lastImportIdx = programBody.reduce(
    (last: number, node: { type?: string }, i: number) =>
      node?.type === "ImportDeclaration" ? i : last,
    -1,
  );
  const insertAt = lastImportIdx >= 0 ? lastImportIdx + 1 : 0;
  programBody.splice(insertAt, 0, importDecl as unknown as { type?: string });
}

/** Convert an ImportSource to a module specifier string for use in import declarations. */
function importSourceToModuleSpecifier(source: ImportSource, filePath: string): string {
  if (source.kind === "specifier") {
    return source.value;
  }
  // absolutePath → relative module specifier from current file
  const baseDir = dirname(filePath);
  let rel = relative(baseDir, source.value).split(sep).join("/");
  // Strip .ts/.tsx extension for module specifier
  rel = rel.replace(/\.tsx?$/, "");
  if (!rel.startsWith(".")) {
    rel = `./${rel}`;
  }
  return rel;
}

/** Resolve an ImportSource to an absolute file path for writing the sidecar file. */
function importSourceToAbsolutePath(source: ImportSource, filePath: string): string {
  if (source.kind === "absolutePath") {
    return source.value;
  }
  // specifier → resolve relative to source file directory, append .ts if no real file extension
  const baseDir = dirname(filePath);
  let resolved = join(baseDir, source.value);
  if (!/\.[jt]sx?$/.test(resolved)) {
    resolved += ".ts";
  }
  return resolved;
}

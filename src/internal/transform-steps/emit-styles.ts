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

  // Collect bridge markers from styledDecls (for unconverted consumer selectors)
  // and merge them with cross-file markers for sidecar emission.
  const allMarkers = new Map(ctx.crossFileMarkers ?? []);
  for (const decl of ctx.styledDecls) {
    if (decl.bridgeMarkerVarName) {
      // Use the decl's styleKey as the map key. If a cross-file marker already
      // exists for this component (ancestor selector), the bridge reuses it.
      allMarkers.set(decl.localName, decl.bridgeMarkerVarName);
    }
  }

  // Emit defineMarker() declarations for cross-file parent components and bridge markers
  if (allMarkers.size > 0) {
    emitDefineMarkerDeclarations(ctx, allMarkers);
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
 * Emit defineMarker declarations into sidecar `.stylex.ts` file(s) and insert
 * import(s) for the markers into the main file. StyleX requires defineMarker()
 * to live in `.stylex.ts` files for the babel plugin's `fileNameForHashing`.
 *
 * Cross-file markers (from component selectors across files) are routed to the
 * adapter's `markerFile` destination. Internal markers (sibling selectors within
 * the same file) always go to a local sidecar to avoid polluting a shared file.
 */
function emitDefineMarkerDeclarations(
  ctx: TransformContext,
  crossFileMarkers: Map<string, string>,
): void {
  // Partition markers into cross-file (adapter-routed) and internal (local sidecar)
  const siblingMarkerKeys = ctx.siblingMarkerKeys ?? new Set<string>();
  const crossFileNames: string[] = [];
  const internalNames: string[] = [];
  for (const [styleKey, markerName] of crossFileMarkers) {
    if (siblingMarkerKeys.has(styleKey)) {
      internalNames.push(markerName);
    } else {
      crossFileNames.push(markerName);
    }
  }

  const adapterMarkerFile = ctx.adapter.markerFile;
  const adapterImportSource =
    crossFileNames.length > 0 ? adapterMarkerFile?.({ filePath: ctx.file.path }) : undefined;

  const fileBase = basename(ctx.file.path).replace(/\.\w+$/, "");
  const localImportPath = `./${fileBase}.stylex`;

  // When adapter doesn't provide a path (or returns undefined), all markers go to local sidecar
  if (!adapterImportSource) {
    const allNames = [...crossFileNames, ...internalNames];
    emitMarkerGroup(ctx, allNames, localImportPath, undefined);
    return;
  }

  const adapterPath = importSourceToModuleSpecifier(adapterImportSource, ctx.file.path);
  const adapterAbsPath = importSourceToAbsolutePath(adapterImportSource, ctx.file.path);

  if (internalNames.length === 0) {
    // All markers are cross-file — single sidecar at adapter destination
    emitMarkerGroup(ctx, crossFileNames, adapterPath, adapterAbsPath);
    return;
  }

  if (crossFileNames.length === 0) {
    // All markers are internal — single local sidecar
    emitMarkerGroup(ctx, internalNames, localImportPath, undefined);
    return;
  }

  // Mixed: cross-file markers to adapter destination, internal to local sidecar
  emitMarkerGroup(ctx, crossFileNames, adapterPath, adapterAbsPath);
  emitMarkerGroup(ctx, internalNames, localImportPath, undefined);
}

/** Build sidecar content and import declaration for a group of markers. */
function emitMarkerGroup(
  ctx: TransformContext,
  markerNames: string[],
  importPath: string,
  absoluteFilePath: string | undefined,
): void {
  const j = ctx.j;
  const markerDecls = markerNames
    .map((name) => {
      const componentName = name.replace(/Marker$/, "");
      return `/** Custom marker for ${componentName} */\nexport const ${name} = stylex.defineMarker();`;
    })
    .join("\n\n");
  const content = `import * as stylex from "@stylexjs/stylex";\n\n${markerDecls}\n`;

  if (!ctx.sidecarFiles) {
    ctx.sidecarFiles = [];
  }
  ctx.sidecarFiles.push({ content, filePath: absoluteFilePath });

  const importDecl = j.importDeclaration(
    markerNames.map((name) => j.importSpecifier(j.identifier(name))),
    j.literal(importPath),
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

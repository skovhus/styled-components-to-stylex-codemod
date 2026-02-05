/**
 * Emits StyleX style objects and required imports into the AST.
 * Core concepts: style object serialization and import management.
 */
import type { StyledDecl, VariantDimension } from "./transform-types.js";
import path from "node:path";
import type { ImportSource, ImportSpec } from "../adapter.js";
import { isAstNode } from "./utilities/jscodeshift-utils.js";
import { lowerFirst } from "./utilities/string-utils.js";
import { literalToAst, objectToAst } from "./transform/helpers.js";
import type { TransformContext } from "./transform-context.js";

export function emitStylesAndImports(ctx: TransformContext): { emptyStyleKeys: Set<string> } {
  const { root, j, file, resolverImports, adapter } = ctx;
  const filePath = file.path;
  const styledImports = ctx.styledImports!;
  const resolvedStyleObjects = ctx.resolvedStyleObjects ?? new Map();
  const styledDecls = ctx.styledDecls as StyledDecl[];
  const stylesIdentifier = ctx.stylesIdentifier ?? "styles";
  const styleMerger = adapter.styleMerger;
  const stylesInsertPosition = ctx.stylesInsertPosition ?? "end";

  // Preserve file header directives (e.g. `// oxlint-disable ...`). Depending on the parser/printer,
  // the comment can be stored on `program.comments`, `node.comments`, or `node.leadingComments`.
  // We remove styled-components imports, so without this we can drop the directive (notably in
  // fixtures like string-interpolation).
  const preservedHeaderComments: any[] = [];
  const addHeaderComments = (comments: unknown) => {
    if (!Array.isArray(comments)) {
      return;
    }
    for (const c of comments as any[]) {
      const v = typeof c?.value === "string" ? String(c.value).trim() : "";
      const line = c?.loc?.start?.line;
      if (v.startsWith("oxlint-disable") && (line === 1 || line === 0 || line === undefined)) {
        preservedHeaderComments.push(c);
      }
    }
  };
  const programAny = root.get().node.program as any;
  addHeaderComments(programAny.comments);
  for (const n of styledImports.nodes()) {
    addHeaderComments((n as any)?.leadingComments);
    addHeaderComments((n as any)?.comments);
  }

  const isBugComment = (c: any): boolean => {
    const v = typeof c?.value === "string" ? String(c.value).trim() : "";
    // Treat "Bug N:" fixture narrative comments as file-level comments, not style-property docs.
    return /^Bug\s+\d+[a-zA-Z]?\s*:/.test(v);
  };

  // Check if a comment looks like a new section header (e.g., "Pattern 1:", "Case 2:")
  const isNewSectionComment = (c: any): boolean => {
    const v = typeof c?.value === "string" ? String(c.value).trim() : "";
    // Pattern N: or similar section headers
    return /^(Pattern|Case|Example|Test|Step|Note)\s*\d*[a-zA-Z]?\s*:/.test(v);
  };

  const splitBugNarrativeLeadingComments = (
    comments: unknown,
  ): { narrative: any[]; property: any[] } => {
    if (!Array.isArray(comments) || comments.length === 0) {
      return { narrative: [], property: [] };
    }
    let bugIdx = -1;
    for (let i = 0; i < comments.length; i++) {
      if (isBugComment((comments as any[])[i])) {
        bugIdx = i;
        break;
      }
    }
    if (bugIdx < 0) {
      return { narrative: [], property: comments as any[] };
    }
    // Only include contiguous comments with the Bug N: comment.
    // Stop when there's a gap AND a new section starts.
    const narrative: any[] = [];
    const property: any[] = [];
    let lastLine = -1;
    let inNarrative = false;
    let hadGap = false;
    for (let i = 0; i < comments.length; i++) {
      const c = (comments as any[])[i];

      if (i < bugIdx) {
        property.push(c);
      } else if (i === bugIdx) {
        narrative.push(c);
        lastLine = c?.loc?.end?.line ?? c?.loc?.start?.line ?? -1;
        inNarrative = true;
      } else if (inNarrative) {
        const startLine = c?.loc?.start?.line ?? -1;
        // Check for a gap (blank line between comments)
        const hasGap = lastLine >= 0 && startLine >= 0 && startLine > lastLine + 1;

        if (hasGap) {
          hadGap = true;
        }

        // End narrative if: there was a gap AND this is a new section comment
        if (hadGap && isNewSectionComment(c)) {
          inNarrative = false;
          property.push(c);
        } else {
          // Continue narrative
          narrative.push(c);
          lastLine = c?.loc?.end?.line ?? startLine;
        }
      } else {
        property.push(c);
      }
    }
    return { narrative, property };
  };

  const hasExportedCssHelper = styledDecls.some((d) => d.isCssHelper && d.isExported);

  // Remove styled-components import(s), but preserve any named imports that are still referenced
  // (e.g. useTheme, withTheme, ThemeProvider if they're still used in the code)
  const preservedSpecifiers: string[] = [];
  for (const importNode of styledImports.nodes()) {
    const specifiers = (importNode as any).specifiers ?? [];
    for (const spec of specifiers) {
      // Skip default import (styled) and namespace imports - handled separately above
      if (spec.type !== "ImportSpecifier") {
        continue;
      }
      const localName = spec.local?.name ?? spec.imported?.name;
      if (!localName) {
        continue;
      }
      // Check if this import is still referenced elsewhere in the code
      // Skip common styled-components exports that are being transformed away
      const transformedAway = [
        "styled",
        "keyframes",
        "createGlobalStyle",
        ...(hasExportedCssHelper ? [] : ["css"]),
      ];
      if (transformedAway.includes(localName)) {
        continue;
      }
      // Check if the identifier is used anywhere in the code
      const usages = root.find(j.Identifier, { name: localName } as any);
      // Filter out usages that are just the import specifier itself
      const realUsages = usages.filter((p: any) => {
        const parent = p.parent?.node;
        return !(parent?.type === "ImportSpecifier");
      });
      if (realUsages.size() > 0) {
        preservedSpecifiers.push(localName);
      }
    }
  }

  // We want to insert the StyleX import where the styled-components import used to be,
  // rather than always hoisting to the top of the file (users can have imports anywhere).
  //
  // Note: we compute this before removing the styled-components import(s).
  const programBodyBeforeRemove = root.get().node.program.body as any[];
  const styledImportNodeSet = new Set<any>(styledImports.nodes() as any[]);
  const firstStyledImportIdx = (() => {
    for (let i = 0; i < programBodyBeforeRemove.length; i++) {
      const s = programBodyBeforeRemove[i];
      if (s?.type === "ImportDeclaration" && styledImportNodeSet.has(s)) {
        return i;
      }
    }
    return -1;
  })();

  // Remove styled-components imports
  styledImports.remove();

  // Insert stylex import FIRST, preferring the styled-components import position when present.
  // This must happen before inserting preserved styled-components imports so those can be placed after stylex.
  const hasStylexImport =
    root.find(j.ImportDeclaration, { source: { value: "@stylexjs/stylex" } } as any).size() > 0;
  if (!hasStylexImport) {
    const stylexImport = j.importDeclaration(
      [j.importNamespaceSpecifier(j.identifier("stylex"))],
      j.literal("@stylexjs/stylex"),
    );
    const body = root.get().node.program.body as any[];
    const insertAt =
      firstStyledImportIdx >= 0 && firstStyledImportIdx <= body.length ? firstStyledImportIdx : 0;
    body.splice(insertAt, 0, stylexImport);
  }

  // Re-add preserved imports from styled-components if any (AFTER stylex import)
  if (preservedSpecifiers.length > 0) {
    const preservedImport = j.importDeclaration(
      preservedSpecifiers.map((name) => j.importSpecifier(j.identifier(name))),
      j.literal("styled-components"),
    );
    // Insert after stylex import
    const body = root.get().node.program.body as any[];
    const stylexIdx = body.findIndex(
      (s) => s?.type === "ImportDeclaration" && (s.source as any)?.value === "@stylexjs/stylex",
    );
    if (stylexIdx >= 0) {
      body.splice(stylexIdx + 1, 0, preservedImport);
    } else {
      body.unshift(preservedImport);
    }
  }

  // Re-attach preserved header comments to the first statement (preferably the stylex import).
  if (preservedHeaderComments.length > 0) {
    const body = root.get().node.program.body as any[];
    const firstStmt = body[0];
    if (body.length > 0 && firstStmt) {
      const existingLeading = (firstStmt as any).leadingComments;
      const existingComments = (firstStmt as any).comments;
      const merged = [
        ...preservedHeaderComments,
        ...(Array.isArray(existingLeading) ? existingLeading : []),
        ...(Array.isArray(existingComments) ? existingComments : []),
      ] as any[];
      const seen = new Set<string>();
      const deduped = merged.filter((c) => {
        const key = `${(c as any)?.type ?? "Comment"}:${String((c as any)?.value ?? "").trim()}`;
        if (seen.has(key)) {
          return false;
        }
        seen.add(key);
        return true;
      });
      (firstStmt as any).leadingComments = deduped;
      (firstStmt as any).comments = deduped;
    }
  }

  // Preserve leading comments that sit on the *styled declaration statement* itself.
  //
  // These often include fixture-level explanations (e.g. "Bug N: ...") that are attached to
  // `export const X = styled...` declarations. Since we remove those declarations later in the
  // transform, we need to migrate their leading comments onto a node that remains (the emitted
  // `const styles = stylex.create(...)` declaration is the best anchor).
  //
  // Important: we avoid duplicating comments that are already being preserved as style property
  // comments via `StyledDecl.leadingComments`.
  const propCommentKeys = new Set<string>();
  for (const decl of styledDecls) {
    const cs = (decl as any).leadingComments;
    if (!Array.isArray(cs)) {
      continue;
    }
    const { property } = splitBugNarrativeLeadingComments(cs);
    for (const c of property) {
      const key = `${(c as any)?.type ?? "Comment"}:${String((c as any)?.value ?? "").trim()}`;
      propCommentKeys.add(key);
    }
  }

  const migratedStyledDeclLeadingComments: any[] = [];
  // Prefer sourcing these from `StyledDecl.leadingComments` (captured from the original styled
  // declaration VariableDeclaration). This is more reliable than reading statement comments
  // because some parsers/printers split multi-line comment runs across different comment arrays.
  const declsByLoc = [...styledDecls].sort((a, b) => {
    const al = ((a as any)?.loc?.start?.line ?? Number.POSITIVE_INFINITY) as number;
    const bl = ((b as any)?.loc?.start?.line ?? Number.POSITIVE_INFINITY) as number;
    return al - bl;
  });
  const firstDeclLocalName = declsByLoc[0]?.localName;
  for (const d of declsByLoc) {
    const cs = (d as any).leadingComments;
    if (!Array.isArray(cs) || cs.length === 0) {
      continue;
    }
    // For wrapper components, keep comments on the wrapper function only to avoid
    // duplicating them on the styles object. Non-wrapper components still use the
    // standard split to separate Bug narrative from property comments.
    const narrative = d.needsWrapperComponent ? [] : splitBugNarrativeLeadingComments(cs).narrative;
    if (narrative.length === 0) {
      continue;
    }
    for (const c of narrative) {
      const key = `${(c as any)?.type ?? "Comment"}:${String((c as any)?.value ?? "").trim()}`;
      if (propCommentKeys.has(key)) {
        continue;
      }
      if ((c as any)?.leading === false) {
        continue;
      }
      // Clone the comment node so we can safely reattach it even if the original
      // declaration node (that initially owned it) is later removed from the AST.
      migratedStyledDeclLeadingComments.push({
        ...(c as any),
        leading: true,
        trailing: false,
      });
    }
    break;
  }

  // Prevent duplicate printing of migrated narrative comments:
  // once we reattach them to the emitted `styles` declaration, we must remove them from the
  // original first styled declaration statement (which will later be replaced by a wrapper).
  if (migratedStyledDeclLeadingComments.length > 0 && firstDeclLocalName) {
    const migratedKeys = new Set(
      migratedStyledDeclLeadingComments.map(
        (c: any) => `${(c as any)?.type ?? "Comment"}:${String((c as any)?.value ?? "").trim()}`,
      ),
    );
    const stripMigrated = (node: any) => {
      if (!node || typeof node !== "object") {
        return;
      }
      const filter = (arr: any) =>
        Array.isArray(arr)
          ? arr.filter((c: any) => {
              const key = `${(c as any)?.type ?? "Comment"}:${String((c as any)?.value ?? "").trim()}`;
              return !migratedKeys.has(key);
            })
          : arr;
      (node as any).leadingComments = filter((node as any).leadingComments);
      (node as any).comments = filter((node as any).comments);
    };

    root
      .find(j.VariableDeclarator, { id: { type: "Identifier", name: firstDeclLocalName } } as any)
      .forEach((p: any) => {
        stripMigrated(p.node);
        const exp = j(p).closest(j.ExportNamedDeclaration);
        if (exp.size() > 0) {
          stripMigrated(exp.get().node);
        }
        const vd = j(p).closest(j.VariableDeclaration);
        if (vd.size() > 0) {
          stripMigrated(vd.get().node);
        }
      });
  }

  // Inject resolver-provided imports (from adapter.resolveValue calls).
  {
    const toModuleSpecifier = (from: ImportSource): string => {
      if (from.kind === "specifier") {
        if (typeof from.value !== "string" || from.value.trim() === "") {
          throw new Error(
            `Invalid import specifier: expected non-empty string, got ${JSON.stringify(
              from.value,
            )}`,
          );
        }
        return from.value;
      }
      // Absolute file path -> relative module specifier from current file
      if (typeof from.value !== "string" || from.value.trim() === "") {
        throw new Error(
          `Invalid import absolutePath: expected non-empty string, got ${JSON.stringify(
            from.value,
          )}`,
        );
      }
      if (!path.isAbsolute(from.value)) {
        throw new Error(
          `Invalid import absolutePath: expected absolute path, got ${JSON.stringify(from.value)}`,
        );
      }
      const baseDir = path.dirname(String(filePath));
      let rel = path.relative(baseDir, from.value);
      rel = rel.split(path.sep).join("/");
      if (!rel.startsWith(".")) {
        rel = `./${rel}`;
      }
      return rel;
    };

    const insertImportDecl = (decl: any): void => {
      const body = root.get().node.program.body as any[];
      const stylexIdx = body.findIndex(
        (s) => s?.type === "ImportDeclaration" && (s.source as any)?.value === "@stylexjs/stylex",
      );
      const lastImportIdx = (() => {
        let last = -1;
        for (let i = 0; i < body.length; i++) {
          if (body[i]?.type === "ImportDeclaration") {
            last = i;
          }
        }
        return last;
      })();
      const importInsertAt =
        stylexIdx >= 0 ? stylexIdx + 1 : lastImportIdx >= 0 ? lastImportIdx + 1 : 0;
      body.splice(importInsertAt, 0, decl);
    };

    const ensureImportDecl = (spec: ImportSpec): void => {
      const moduleSpecifier = toModuleSpecifier(spec.from);
      const existing = root.find(j.ImportDeclaration, {
        source: { value: moduleSpecifier },
      } as any);

      const toImportSpecifier = (imported: string, local?: string) => {
        const impId = j.identifier(imported);
        if (local && local !== imported) {
          return j.importSpecifier(impId, j.identifier(local));
        }
        return j.importSpecifier(impId);
      };

      if (existing.size() > 0) {
        // Merge into the first matching import.
        const p: any = existing.at(0).get();
        const decl: any = p.node;
        const specs = (decl.specifiers ?? []) as any[];
        const existingKeys = new Set(
          specs
            .filter((s) => s.type === "ImportSpecifier")
            .map((s) => {
              const imported = s.imported?.name ?? s.imported?.value ?? "";
              const local = s.local?.name ?? imported;
              return `${imported} as ${local}`;
            }),
        );
        for (const n of spec.names) {
          const imported = n.imported;
          const local = n.local ?? imported;
          const key = `${imported} as ${local}`;
          if (!existingKeys.has(key)) {
            specs.push(toImportSpecifier(imported, n.local));
            existingKeys.add(key);
          }
        }

        decl.specifiers = specs;
        return;
      }

      // No existing import: insert a new one.
      const decl = j.importDeclaration(
        spec.names.map((n) => toImportSpecifier(n.imported, n.local)),
        j.literal(moduleSpecifier),
      );
      insertImportDecl(decl);
    };

    for (const spec of resolverImports.values() as Iterable<ImportSpec>) {
      ensureImportDecl(spec);
    }

    // Add style merger function import if configured and at least one component needs className/style merging.
    // Requirements:
    // 1. Component must have a wrapper (needsWrapperComponent) - inlined components don't merge
    // 2. Component must NOT be a polymorphic intrinsic wrapper - these pass style through directly
    // 3. Component must accept external styles (supportsExternalStyles, usedAsValue, or receivesClassNameOrStyleInJsx)
    const needsMergerImport = styledDecls.some((d) => {
      // Must have a wrapper to use the merger
      if (!d.needsWrapperComponent) {
        return false;
      }
      // Polymorphic intrinsic wrappers only need the merger when they support external styling.
      if ((d as any).isPolymorphicIntrinsicWrapper) {
        return (
          d.supportsExternalStyles || d.usedAsValue || (d as any).receivesClassNameOrStyleInJsx
        );
      }
      // Component must support external styling to need the merger
      return d.supportsExternalStyles || d.usedAsValue || (d as any).receivesClassNameOrStyleInJsx;
    });
    if (styleMerger && needsMergerImport) {
      ensureImportDecl({
        from: styleMerger.importSource,
        names: [{ imported: styleMerger.functionName }],
      });
    }
  }

  // Build a map from styleKey to leadingComments for comment preservation.
  // For components that need wrappers BUT have shouldForwardProp, comments should
  // appear in BOTH stylex.create AND on the wrapper function.
  // For exported components WITHOUT shouldForwardProp, comments should only go on
  // the wrapper function (to avoid duplication).
  const styleKeyToComments = new Map<string, any[]>();
  for (const decl of styledDecls) {
    // Skip exported components that will have wrappers but don't use shouldForwardProp.
    // Their comments should only appear on the wrapper function, not in stylex.create.
    if (decl.needsWrapperComponent && !decl.shouldForwardProp) {
      continue;
    }
    if (decl.leadingComments && decl.leadingComments.length > 0) {
      // Avoid attaching "Bug N:" narrative comments to a specific style property inside
      // `stylex.create({ ... })` — those belong above the `styles` declaration instead.
      const { property } = splitBugNarrativeLeadingComments(decl.leadingComments);
      if (property.length > 0) {
        styleKeyToComments.set(decl.styleKey, property);
      }
    }
  }

  // Compute the set of empty style keys (style objects with no properties)
  const emptyStyleKeys = new Set<string>();
  for (const [k, v] of resolvedStyleObjects.entries()) {
    if (v && typeof v === "object" && !isAstNode(v)) {
      if (Object.keys(v as Record<string, unknown>).length === 0) {
        emptyStyleKeys.add(k);
      }
    }
  }

  // Insert `const styles = stylex.create(...)` (or stylexStyles if styles is already used) near top (after imports)
  const stylesDecl = j.variableDeclaration("const", [
    j.variableDeclarator(
      j.identifier(stylesIdentifier),
      j.callExpression(j.memberExpression(j.identifier("stylex"), j.identifier("create")), [
        j.objectExpression(
          [...resolvedStyleObjects.entries()]
            // Filter out empty style objects
            .filter(([k]) => !emptyStyleKeys.has(k))
            .map(([k, v]) => {
              const prop = j.property(
                "init",
                j.identifier(k),
                v && typeof v === "object" && !isAstNode(v)
                  ? objectToAst(j, v as Record<string, unknown>)
                  : literalToAst(j, v),
              );
              const comments = styleKeyToComments.get(k);
              if (comments && comments.length > 0) {
                (prop as any).comments = comments.map((c: any) => ({
                  ...c,
                  leading: true,
                  trailing: false,
                }));
              }
              return prop;
            }),
        ),
      ]),
    ),
  ]);

  // Attach migrated leading comments (from the first styled declaration) to `styles`.
  if (migratedStyledDeclLeadingComments.length > 0) {
    const merged = [
      ...migratedStyledDeclLeadingComments,
      ...(Array.isArray((stylesDecl as any).leadingComments)
        ? (stylesDecl as any).leadingComments
        : []),
      ...(Array.isArray((stylesDecl as any).comments) ? (stylesDecl as any).comments : []),
    ] as any[];
    const seen = new Set<string>();
    const deduped = merged.filter((c) => {
      const key = `${(c as any)?.type ?? "Comment"}:${String((c as any)?.value ?? "").trim()}`;
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    });
    (stylesDecl as any).leadingComments = deduped;
    (stylesDecl as any).comments = deduped;
  }

  const programBody = root.get().node.program.body as any[];
  if (stylesInsertPosition === "afterImports") {
    const lastImportIdx = (() => {
      let last = -1;
      for (let i = 0; i < programBody.length; i++) {
        if (programBody[i]?.type === "ImportDeclaration") {
          last = i;
        }
      }
      return last;
    })();
    const insertAt = lastImportIdx >= 0 ? lastImportIdx + 1 : 0;
    programBody.splice(insertAt, 0, stylesDecl as any);
  } else {
    // Place `styles` at the very end of the file.
    // This keeps component logic first, styles last for better readability.
    programBody.push(stylesDecl as any);
  }

  // Emit separate stylex.create declarations for variant dimensions
  // This implements the StyleX "variants recipe" pattern where each variant
  // dimension (e.g., color, size) gets its own stylex.create call.
  //
  // First pass: detect name conflicts (same variantObjectName with different content)
  // If two components have the same prop name but different styles, we need unique names
  const dimensionsByName = new Map<
    string,
    Array<{ dimension: VariantDimension; componentName: string; contentKey: string }>
  >();

  for (const decl of styledDecls) {
    if (!decl.variantDimensions) {
      continue;
    }
    for (const dimension of decl.variantDimensions) {
      const name = dimension.variantObjectName;
      const contentKey = JSON.stringify(dimension.variants);
      const entries = dimensionsByName.get(name) ?? [];
      entries.push({ dimension, componentName: decl.localName, contentKey });
      dimensionsByName.set(name, entries);
    }
  }

  // Second pass: rename conflicting dimensions to include component prefix
  for (const [name, entries] of dimensionsByName) {
    // Check if all entries have the same content (can share the same declaration)
    const uniqueContents = new Set(entries.map((e) => e.contentKey));
    if (uniqueContents.size > 1) {
      // Conflict: same name but different content - rename each to include component prefix
      for (const entry of entries) {
        const prefix = lowerFirst(entry.componentName);
        // Extract the base name (e.g., "colorVariants" → "Color", "variants" → "")
        const baseName = name.endsWith("Variants") ? name.slice(0, -8) : name;
        const capitalBase = baseName.charAt(0).toUpperCase() + baseName.slice(1);
        entry.dimension.variantObjectName = capitalBase
          ? `${prefix}${capitalBase}Variants`
          : `${prefix}Variants`;
      }
    }
  }

  // Third pass: emit declarations (dedupe by final name and content)
  const emittedDimensions = new Map<string, string>(); // name → contentKey
  for (const decl of styledDecls) {
    if (!decl.variantDimensions) {
      continue;
    }

    for (const dimension of decl.variantDimensions) {
      const name = dimension.variantObjectName;
      const contentKey = JSON.stringify(dimension.variants);

      // Skip if already emitted with same content
      if (emittedDimensions.get(name) === contentKey) {
        continue;
      }
      emittedDimensions.set(name, contentKey);

      const variantDecl = emitVariantDimensionDecl(j, dimension);
      programBody.push(variantDecl as any);
    }
  }

  return { emptyStyleKeys };
}

/**
 * Emit a variant dimension as a separate `const <name>Variants = stylex.create({...})` call.
 * Includes eslint-disable comment for stylex/no-unused since variant styles are accessed dynamically.
 */
function emitVariantDimensionDecl(j: any, dimension: VariantDimension): any {
  const properties = Object.entries(dimension.variants).map(([variantValue, styles]) => {
    return j.property(
      "init",
      j.identifier(variantValue),
      styles && typeof styles === "object" && !isAstNode(styles)
        ? objectToAst(j, styles as Record<string, unknown>)
        : literalToAst(j, styles),
    );
  });

  const variantDecl = j.variableDeclaration("const", [
    j.variableDeclarator(
      j.identifier(dimension.variantObjectName),
      j.callExpression(j.memberExpression(j.identifier("stylex"), j.identifier("create")), [
        j.objectExpression(properties),
      ]),
    ),
  ]);

  return variantDecl;
}

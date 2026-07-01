/**
 * Emits StyleX style objects and required imports into the AST.
 * Core concepts: style object serialization and import management.
 */
import type { LocalStylexVarRef, StyledDecl, VariantDimension } from "./transform-types.js";
import type { ImportSpec } from "../adapter.js";
import {
  collectIdentifiers,
  collectPatternBindingNames,
  isAstNode,
} from "./utilities/jscodeshift-utils.js";
import { isJSDocBlockComment, lowerFirst } from "./utilities/string-utils.js";
import { literalToAst, objectToAst } from "./transform/helpers.js";
import type { TransformContext } from "./transform-context.js";
import { propagatePropComments } from "./lower-rules/comments.js";
import { expandStyleObjectShorthands } from "./lower-rules/style-object-normalization.js";
import { findUncollectedStyledTemplateLoc } from "./utilities/uncollected-styled-template.js";
import {
  assertValidImportSource,
  importSourceToModuleSpecifier,
} from "./utilities/import-source.js";
import {
  findLastImportIndex,
  insertImportDeclarationNearStylex,
} from "./utilities/import-insertion.js";
import { LOGICAL_TO_PHYSICAL, SHORTHAND_LONGHANDS } from "./stylex-shorthands.js";
import {
  buildStyleKeySequence,
  type StyleSequenceEntry,
} from "./utilities/style-composition-plan.js";
import { pruneUnusedInlineKeyframes } from "./utilities/inline-keyframes-liveness.js";

/**
 * CSS shorthands that must NEVER appear as property names in stylex.create() output.
 * These are shorthands that StyleX cannot handle at all — they must always be expanded
 * to longhands by the codemod.
 *
 * Note: `margin`/`padding`/`scrollMargin`/`scrollPadding` are NOT listed because
 * StyleX's Babel plugin accepts them as single-value shorthands.
 */
const FORBIDDEN_STYLEX_SHORTHANDS = new Set([
  "border",
  "borderTop",
  "borderRight",
  "borderBottom",
  "borderLeft",
  "background",
]);

export function emitStylesAndImports(ctx: TransformContext): { emptyStyleKeys: Set<string> } {
  const { root, j, file, resolverImports } = ctx;
  const filePath = file.path;
  const styledImports = ctx.styledImports!;
  const resolvedStyleObjects = ctx.resolvedStyleObjects ?? new Map();
  const styledDecls = ctx.styledDecls as StyledDecl[];
  const stylesIdentifier = ctx.stylesIdentifier ?? "styles";
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
  // When any decl failed to transform, its original `styled\`...\`` declaration
  // stays in the source. The `styled` default import (and any named styled-components
  // imports the skipped decl still references — e.g. `css` used inside its template)
  // must be preserved so the surviving code keeps compiling.
  const hasSkippedStyledDecls = styledDecls.some((d) => d.skipTransform);
  const hasUncollectedStyledUsage =
    findUncollectedStyledTemplateLoc({
      root,
      j,
      isStyledTag: ctx.isStyledTag,
      styledDecls,
    }) !== undefined;
  const hasRemainingStyledKeyframesUsage =
    !!ctx.keyframesLocal &&
    root
      .find(j.TaggedTemplateExpression, {
        tag: { type: "Identifier", name: ctx.keyframesLocal },
      } as any)
      .size() > 0;

  // Remove styled-components import(s), but preserve any named imports that are still referenced
  // (e.g. useTheme, withTheme, ThemeProvider if they're still used in the code)
  const preservedSpecifiers: Array<{ imported: string; local: string }> = [];
  let preservedDefaultStyled: string | undefined;
  // Exports that the codemod transforms away: removed unless they're still referenced
  // by other surviving code. When a skipped decl is present, every surviving reference
  // matters, so we skip the fast-path and fall through to the reference check.
  const transformedAway = [
    "styled",
    ...(hasRemainingStyledKeyframesUsage ? [] : ["keyframes"]),
    "createGlobalStyle",
    ...(hasExportedCssHelper ? [] : ["css"]),
  ];
  for (const importNode of styledImports.nodes()) {
    const specifiers = (importNode as any).specifiers ?? [];
    for (const spec of specifiers) {
      // Default import: only `styled`. Preserved whenever a decl stayed as
      // styled-components — the remaining `styled.tag` call sites need it.
      if (spec.type === "ImportDefaultSpecifier") {
        if (spec.local?.name && (hasSkippedStyledDecls || hasUncollectedStyledUsage)) {
          preservedDefaultStyled = spec.local.name;
        }
        continue;
      }
      if (spec.type !== "ImportSpecifier") {
        continue;
      }
      const importedName = spec.imported?.name;
      const localName = spec.local?.name ?? importedName;
      // The imported name is what styled-components exports (e.g. `css`) and must
      // survive into the re-emitted specifier — emitting only the alias would turn
      // `import { styled as sc }` into `import { sc }`, which is not a valid export.
      if (!importedName || !localName) {
        continue;
      }
      if (
        !hasSkippedStyledDecls &&
        !hasUncollectedStyledUsage &&
        transformedAway.includes(localName)
      ) {
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
        preservedSpecifiers.push({ imported: importedName, local: localName });
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
  let insertedStylexImport: ReturnType<typeof j.importDeclaration> | undefined;
  if (!hasStylexImport) {
    insertedStylexImport = j.importDeclaration(
      [j.importNamespaceSpecifier(j.identifier("stylex"))],
      j.literal("@stylexjs/stylex"),
    );
    const body = root.get().node.program.body as any[];
    const insertAt =
      firstStyledImportIdx >= 0 && firstStyledImportIdx <= body.length ? firstStyledImportIdx : 0;
    body.splice(insertAt, 0, insertedStylexImport);
  }

  // Re-add preserved imports from styled-components if any (AFTER stylex import)
  if (preservedSpecifiers.length > 0 || preservedDefaultStyled) {
    const specifiers: any[] = [];
    if (preservedDefaultStyled) {
      specifiers.push(j.importDefaultSpecifier(j.identifier(preservedDefaultStyled)));
    }
    for (const { imported, local } of preservedSpecifiers) {
      // Preserve `import { X as Y }` aliases — specifier's `local` must match how the
      // surviving source references the binding, while `imported` stays the actual export.
      specifiers.push(
        imported === local
          ? j.importSpecifier(j.identifier(imported))
          : j.importSpecifier(j.identifier(imported), j.identifier(local)),
      );
    }
    const preservedImport = j.importDeclaration(specifiers, j.literal("styled-components"));
    insertImportDeclarationNearStylex(root, preservedImport);
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
    if (decl.skipTransform) {
      continue;
    }
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
  const declsByLoc = styledDecls
    .filter((d) => !d.skipTransform)
    .sort((a, b) => {
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
    const toModuleSpecifier = (from: ImportSpec["from"]): string => {
      assertValidImportSource(from, "import");
      return importSourceToModuleSpecifier(from, String(filePath), { stripTsExtension: true });
    };

    const insertImportDecl = (decl: any): void => {
      insertImportDeclarationNearStylex(root, decl);
    };

    const ensureImportDecl = (spec: ImportSpec): void => {
      const moduleSpecifier = toModuleSpecifier(spec.from);
      const existing = root
        .find(j.ImportDeclaration, {
          source: { value: moduleSpecifier },
        } as any)
        .filter((p: any) => p.node.importKind !== "type");

      const toImportSpecifier = (imported: string, local?: string) => {
        // Handle default imports: { imported: "default", local: "foo" } -> import foo from "..."
        if (imported === "default") {
          return j.importDefaultSpecifier(j.identifier(local ?? "default"));
        }
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
  }

  // Build a map from styleKey to leadingComments for comment preservation.
  // Components with wrappers already have the comment on the wrapper function,
  // so skip them to avoid duplication in stylex.create.
  const styleKeyToComments = new Map<string, any[]>();
  for (const decl of styledDecls) {
    if (decl.skipTransform || decl.needsWrapperComponent) {
      continue;
    }
    if (decl.leadingComments && decl.leadingComments.length > 0) {
      // Avoid attaching "Bug N:" narrative comments to a specific style property inside
      // `stylex.create({ ... })` — those belong above the `styles` declaration instead.
      const { property } = splitBugNarrativeLeadingComments(decl.leadingComments);
      const stylexCreateComments = property.filter((comment) => !isJSDocBlockComment(comment));
      if (stylexCreateComments.length > 0) {
        styleKeyToComments.set(decl.styleKey, stylexCreateComments);
      }
    }
  }

  // Normalize shorthand/longhand conflicts across style objects within the same component.
  // When one style object has a shorthand (e.g., `margin`) and another has a longhand
  // (e.g., `marginBottom`), StyleX's atomic CSS won't reliably resolve the override.
  // We expand the shorthand into longhands that match the form used by the conflicting
  // longhands (physical or logical).
  normalizeShorthandLonghandConflicts(styledDecls, resolvedStyleObjects);

  // Safety net: assert no unexpanded CSS shorthands leaked into style objects.
  // Shorthands in FORBIDDEN_STYLEX_SHORTHANDS (border/background) should have been
  // expanded by cssDeclarationToStylexDeclarations() or equivalent handlers upstream.
  assertNoUnexpandedShorthands(resolvedStyleObjects);

  // Compute the set of empty style keys (style objects with no properties)
  const emptyStyleKeys = new Set<string>();
  const activeMixinStyleKeys = new Set<string>();
  for (const decl of styledDecls) {
    if (decl.skipTransform || decl.isCssHelper) {
      continue;
    }
    for (const key of decl.extraStyleKeys ?? []) {
      activeMixinStyleKeys.add(key);
    }
  }
  const preservedCssHelperStyleKeys = new Set(
    styledDecls
      .filter(
        (decl) =>
          decl.isCssHelper &&
          (decl.suppressCssHelperStyleEmission || decl.isExported) &&
          !activeMixinStyleKeys.has(decl.styleKey),
      )
      .map((decl) => decl.styleKey),
  );
  for (const [k, v] of resolvedStyleObjects.entries()) {
    if (v && typeof v === "object" && !isAstNode(v)) {
      if (Object.keys(v as Record<string, unknown>).length === 0) {
        emptyStyleKeys.add(k);
      }
    }
  }

  // Insert `const styles = stylex.create(...)` (or stylexStyles if styles is already used) near top (after imports)
  const nonEmptyStyleEntries = [...resolvedStyleObjects.entries()].filter(
    ([k]) => !emptyStyleKeys.has(k) && !preservedCssHelperStyleKeys.has(k),
  );

  const buildStyleEntryProperty = ([k, v]: [string, unknown]): any => {
    const prop = j.property(
      "init",
      j.identifier(k),
      v && typeof v === "object" && !isAstNode(v)
        ? objectToAst(j, normalizeStyleObjectForEmission(v as Record<string, unknown>))
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
  };

  // If we're merging new entries into an existing `stylex.create({...})` that was
  // already present in the source (partial-migration flow), append properties to
  // its ObjectExpression in-place instead of creating a second declaration.
  const mergeTarget = ctx.existingStylexStylesTarget;
  if (mergeTarget && nonEmptyStyleEntries.length > 0) {
    const existingObj = mergeTarget.objectExpression as { properties?: any[] };
    const existingProps = existingObj.properties ?? [];
    existingObj.properties = [
      ...existingProps,
      ...nonEmptyStyleEntries.map(buildStyleEntryProperty),
    ];
  }

  const stylesDecl =
    !mergeTarget && nonEmptyStyleEntries.length > 0
      ? j.variableDeclaration("const", [
          j.variableDeclarator(
            j.identifier(stylesIdentifier),
            j.callExpression(j.memberExpression(j.identifier("stylex"), j.identifier("create")), [
              j.objectExpression(nonEmptyStyleEntries.map(buildStyleEntryProperty)),
            ]),
          ),
        ])
      : null;

  // Attach migrated leading comments (from the first styled declaration) to `styles`.
  if (stylesDecl && migratedStyledDeclLeadingComments.length > 0) {
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

  pruneUnusedInlineKeyframes({
    state: ctx,
    emittedStyleValues: nonEmptyStyleEntries.map(([, value]) => value),
    styledDecls,
  });

  // Emit inline @keyframes as `const <name> = stylex.keyframes({...})` before stylex.create.
  const inlineKeyframeDecls: any[] = [];
  if (ctx.inlineKeyframes && ctx.inlineKeyframes.size > 0) {
    for (const [name, frames] of ctx.inlineKeyframes) {
      const kfDecl = j.variableDeclaration("const", [
        j.variableDeclarator(
          j.identifier(name),
          j.callExpression(j.memberExpression(j.identifier("stylex"), j.identifier("keyframes")), [
            objectToAst(j, frames as Record<string, unknown>),
          ]),
        ),
      ]);
      inlineKeyframeDecls.push(kfDecl);
    }
  }

  emitLocalDefineVarsSidecars(ctx, [
    ...nonEmptyStyleEntries.map(([, value]) => value),
    ...styledDecls.flatMap((decl) => (decl.inlineStyleProps ?? []).map((prop) => prop.expr)),
  ]);
  const programBody = root.get().node.program.body as any[];
  const stylesAnchorIndex = resolveStylesAnchorIndex({
    programBody,
    stylesInsertPosition,
    stylesIdentifier,
    mergeTarget,
    willInsertStylesDecl: stylesDecl != null,
  });
  const removedStyledDeclNames = new Set(
    styledDecls.filter((decl) => !decl.skipTransform).map((decl) => decl.localName),
  );
  const { statements: relocatedKeyframes, insertIndex: keyframesInsertIndex } =
    extractModuleLevelStylexKeyframesStatements(
      programBody,
      stylesAnchorIndex,
      removedStyledDeclNames,
    );
  const insertNodes = [
    ...relocatedKeyframes,
    ...inlineKeyframeDecls,
    ...(stylesDecl ? [stylesDecl as any] : []),
  ];
  if (insertNodes.length > 0) {
    programBody.splice(keyframesInsertIndex, 0, ...insertNodes);
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
    if (decl.skipTransform || !decl.variantDimensions) {
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
    if (decl.skipTransform || !decl.variantDimensions) {
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

  const hasActiveStyledDecl = styledDecls.some((decl) => !decl.skipTransform);
  if (
    insertedStylexImport &&
    !hasActiveStyledDecl &&
    !stylesDecl &&
    inlineKeyframeDecls.length === 0 &&
    emittedDimensions.size === 0 &&
    resolverImports.size === 0
  ) {
    const body = root.get().node.program.body as any[];
    const index = body.indexOf(insertedStylexImport);
    if (index >= 0) {
      body.splice(index, 1);
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
    // Use identifier for valid JS identifiers, numeric literal for numeric strings
    // (so `keyof typeof` yields number types matching JSX usage like `gap={8}`),
    // and string literal for hyphenated/special keys.
    const key = /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(variantValue)
      ? j.identifier(variantValue)
      : isFiniteNumericString(variantValue)
        ? j.literal(Number(variantValue))
        : j.literal(variantValue);
    return j.property(
      "init",
      key,
      styles && typeof styles === "object" && !isAstNode(styles)
        ? objectToAst(j, normalizeStyleObjectForEmission(styles as Record<string, unknown>))
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

function normalizeStyleObjectForEmission(
  styleObj: Record<string, unknown>,
): Record<string, unknown> {
  return expandStyleObjectShorthands(styleObj);
}

/**
 * Returns true when `s` is a canonical numeric string (round-trips through Number).
 * Rejects non-canonical forms like "08", "0x10", "1e2" where `String(Number(s)) !== s`,
 * since emitting those as numeric keys would change the lookup semantics.
 */
function isFiniteNumericString(s: string): boolean {
  if (s === "") {
    return false;
  }
  const n = Number(s);
  return Number.isFinite(n) && String(n) === s;
}

// ---------------------------------------------------------------------------
// Shorthand/longhand conflict normalization
// ---------------------------------------------------------------------------

/** Type guard: value is a simple string or number (not a conditional object) */
function isSimpleStyleValue(value: unknown): value is string | number {
  return typeof value === "string" || typeof value === "number";
}

function isExpandableLogicalValue(
  value: unknown,
): value is string | number | Record<string, unknown> {
  return (
    isSimpleStyleValue(value) ||
    (!!value && typeof value === "object" && !Array.isArray(value) && !isAstNode(value))
  );
}

function cloneStyleValue(value: unknown): unknown {
  return isStyleValueMap(value) ? { ...value } : value;
}

function isStyleValueMap(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value) && !isAstNode(value);
}

function mergeStyleValuesBySourceOrder(earlierValue: unknown, laterValue: unknown): unknown {
  if (isStyleValueMap(laterValue)) {
    const merged: Record<string, unknown> = isStyleValueMap(earlierValue)
      ? { ...earlierValue }
      : { default: earlierValue };

    for (const [key, value] of Object.entries(laterValue)) {
      if (
        key === "default" &&
        (value === null || value === undefined) &&
        merged.default !== null &&
        merged.default !== undefined
      ) {
        continue;
      }
      merged[key] = value;
    }
    return merged;
  }

  if (isStyleValueMap(earlierValue)) {
    return { ...earlierValue, default: laterValue };
  }

  return cloneStyleValue(laterValue);
}

function mergeLogicalPhysicalValues(args: {
  logicalValue: unknown;
  physicalValue: unknown;
  logicalIndex: number;
  physicalIndex: number;
  priorPhysicalValue: unknown;
}): unknown {
  const { logicalValue, physicalValue, logicalIndex, physicalIndex, priorPhysicalValue } = args;
  if (physicalIndex < 0) {
    if (priorPhysicalValue !== undefined && shouldSeedFromPriorPhysicalValue(logicalValue)) {
      return mergeStyleValuesBySourceOrder(priorPhysicalValue, logicalValue);
    }
    return cloneStyleValue(logicalValue);
  }
  if (logicalIndex > physicalIndex) {
    return mergeStyleValuesBySourceOrder(physicalValue, logicalValue);
  }
  return mergeStyleValuesBySourceOrder(logicalValue, physicalValue);
}

function shouldSeedFromPriorPhysicalValue(logicalValue: unknown): boolean {
  if (!isStyleValueMap(logicalValue)) {
    return false;
  }
  return logicalValue.default === null || logicalValue.default === undefined;
}

function getPriorPhysicalValue(
  currentKey: string,
  prop: string,
  componentStyleEntries: readonly StyleSequenceEntry[],
  resolvedStyleObjects: Map<string, unknown>,
): unknown {
  let priorValue: unknown;
  for (const entry of componentStyleEntries) {
    if (entry.styleKey === currentKey) {
      return priorValue;
    }
    const style = styleObjectForSequenceEntry(entry, resolvedStyleObjects);
    if (!style || !(prop in style)) {
      continue;
    }
    priorValue = style[prop];
  }
  return undefined;
}

/**
 * Replace properties in a style object in-place, preserving property ordering.
 * Each key in `replacements` maps a property name to its replacement entries.
 * Properties not in `replacements` are kept as-is.
 */
function replacePropsInPlace(
  style: Record<string, unknown>,
  replacements: Map<string, Array<{ prop: string; value: unknown }>>,
): void {
  const entries = Object.entries(style);
  const propCommentTargets: Array<{ sourceProp: string; targetProps: string[] }> = [];
  for (const key of Object.keys(style)) {
    delete style[key];
  }
  for (const [key, val] of entries) {
    const replacement = replacements.get(key);
    if (replacement) {
      propCommentTargets.push({
        sourceProp: key,
        targetProps: replacement.map((r) => r.prop),
      });
      for (const r of replacement) {
        style[r.prop] = r.value;
      }
    } else {
      style[key] = val;
    }
  }
  for (const { sourceProp, targetProps } of propCommentTargets) {
    propagatePropComments(style, sourceProp, targetProps);
  }
}

/**
 * Expand shorthand properties in style objects when they conflict with longhands
 * in other style objects of the same component.
 *
 * Safety net: detects unexpanded CSS shorthands that leaked into resolved style objects.
 * Should never fire in production — if it does, it indicates a missing shorthand expansion
 * in one of the CSS-to-StyleX transform paths.
 *
 * Only checks shorthands that StyleX truly cannot handle:
 * - `border`/`borderTop`/etc. must always expand to width/style/color
 * - `background` must always map to `backgroundColor` or `backgroundImage`
 *
 * Note: `margin`/`padding`/`scrollMargin`/`scrollPadding` as single values are valid
 * in StyleX (its Babel plugin expands them), so they are NOT checked here.
 */
function assertNoUnexpandedShorthands(resolvedStyleObjects: Map<string, unknown>): void {
  for (const [styleKey, style] of resolvedStyleObjects) {
    if (!style || typeof style !== "object" || isAstNode(style)) {
      continue;
    }
    for (const prop of Object.keys(style as Record<string, unknown>)) {
      if (FORBIDDEN_STYLEX_SHORTHANDS.has(prop)) {
        // Allow `background: "none"` — this is a CSS reset value that StyleX accepts
        // as-is; expanding to `backgroundColor: "none"` would be invalid CSS. The value
        // may be wrapped in pseudo/media maps, e.g. `{ default: null, ":hover": "none" }`.
        const val = (style as Record<string, unknown>)[prop];
        if (prop === "background" && isBackgroundNoneResetValue(val)) {
          continue;
        }
        throw new Error(
          `Unexpanded CSS shorthand "${prop}" in style object "${styleKey}". ` +
            `This property must be expanded to longhands before reaching StyleX output. ` +
            `Use cssDeclarationToStylexDeclarations() or the appropriate shorthand handler.`,
        );
      }
    }
  }
}

function isBackgroundNoneResetValue(value: unknown): boolean {
  if (value == null) {
    return true;
  }
  if (typeof value === "string") {
    return value.replace(/ !important$/, "") === "none";
  }
  if (!value || typeof value !== "object" || Array.isArray(value) || isAstNode(value)) {
    return false;
  }
  const nestedValues = Object.values(value);
  return nestedValues.length > 0 && nestedValues.every(isBackgroundNoneResetValue);
}

/**
 * Example: component has base `marginBottom: "8px"` and conditional `margin: "24px"`.
 * StyleX's atomic CSS won't reliably resolve `margin` overriding `marginBottom`,
 * so we expand `margin: "24px"` → `marginTop/Right/Bottom/Left: "24px"`.
 *
 * The expansion form matches the conflicting longhands:
 *  - physical (`marginBottom`) → `marginTop/Right/Bottom/Left`
 *  - logical (`paddingBlock`) → `paddingBlock/paddingInline`
 */
function normalizeShorthandLonghandConflicts(
  styledDecls: StyledDecl[],
  resolvedStyleObjects: Map<string, unknown>,
): void {
  for (const decl of styledDecls) {
    if (decl.skipTransform) {
      continue;
    }
    const componentStyleEntries = buildStyleKeySequence(
      { resolvedStyleObjects } as TransformContext,
      decl,
    );
    if (componentStyleEntries.length < 2) {
      continue;
    }

    // Collect all property names across all style objects
    const propsByKey = new Map<string, Set<string>>();
    for (const entry of componentStyleEntries) {
      const style = styleObjectForSequenceEntry(entry, resolvedStyleObjects);
      if (!style) {
        continue;
      }
      propsByKey.set(entry.styleKey, new Set(Object.keys(style)));
    }

    for (const [shorthand, longhands] of Object.entries(SHORTHAND_LONGHANDS)) {
      // Find style keys that use the shorthand
      const shorthandKeys: string[] = [];
      for (const [key, props] of propsByKey) {
        if (props.has(shorthand)) {
          shorthandKeys.push(key);
        }
      }
      if (shorthandKeys.length === 0) {
        continue;
      }

      // Check if any OTHER style object uses longhands of this shorthand
      let hasPhysicalConflict = false;
      let hasLogicalConflict = false;
      for (const [key, props] of propsByKey) {
        if (shorthandKeys.includes(key)) {
          continue;
        } // skip same object
        if (longhands.physical.some((l) => props.has(l))) {
          hasPhysicalConflict = true;
        }
        if (longhands.logical.some((l) => props.has(l))) {
          hasLogicalConflict = true;
        }
      }

      if (!hasPhysicalConflict && !hasLogicalConflict) {
        continue;
      }

      // Expand the shorthand in each style object that has it
      for (const key of shorthandKeys) {
        const style = resolvedStyleObjects.get(key) as Record<string, unknown>;
        const value = style[shorthand];
        if (value === undefined || value === null || !isSimpleStyleValue(value)) {
          continue;
        }

        expandShorthandInStyle(style, shorthand, value, hasLogicalConflict && !hasPhysicalConflict);
      }
    }

    // Phase 2: Detect logical-vs-physical longhand conflicts across all property families.
    // E.g., base has `marginBottom` (physical) and conditional has `marginBlock` (logical).
    // These generate independent atomic classes that don't reliably override each other.
    // Runs independently of phase 1 since CSS lowering may have already expanded shorthands.
    for (const longhands of Object.values(SHORTHAND_LONGHANDS)) {
      normalizeLogicalPhysicalConflicts(
        longhands,
        propsByKey,
        resolvedStyleObjects,
        componentStyleEntries,
      );
    }
  }
}

function styleObjectForSequenceEntry(
  entry: StyleSequenceEntry,
  resolvedStyleObjects: Map<string, unknown>,
): Record<string, unknown> | undefined {
  const style = entry.styleObj ?? resolvedStyleObjects.get(entry.styleKey);
  return isStyleValueMap(style) ? style : undefined;
}

/**
 * Detect and resolve logical-vs-physical longhand conflicts within a component's
 * style objects. When one style object uses logical longhands (e.g., `marginBlock`)
 * and another uses physical longhands (e.g., `marginBottom`), expand the logical
 * longhands to their physical equivalents so the atomic CSS override is reliable.
 */
function normalizeLogicalPhysicalConflicts(
  longhands: { physical: string[]; logical: string[] },
  propsByKey: Map<string, Set<string>>,
  resolvedStyleObjects: Map<string, unknown>,
  componentStyleEntries: readonly StyleSequenceEntry[],
): void {
  const logicalProps = getLogicalPropsForPhysicalFamily(longhands.physical);
  const hasPhysical = [...propsByKey.values()].some((props) =>
    longhands.physical.some((l) => props.has(l)),
  );
  const logicalKeys = [...propsByKey.entries()]
    .filter(([, props]) => logicalProps.some((l) => props.has(l)))
    .map(([key]) => key);

  if (!hasPhysical || logicalKeys.length === 0) {
    return;
  }

  for (const key of logicalKeys) {
    const currentEntry = componentStyleEntries.find((entry) => entry.styleKey === key);
    const style = currentEntry
      ? styleObjectForSequenceEntry(currentEntry, resolvedStyleObjects)
      : undefined;
    if (!style) {
      continue;
    }
    const entries = Object.entries(style);
    const replacements = new Map<string, Array<{ prop: string; value: unknown }>>();
    for (const logicalProp of logicalProps) {
      const value = style[logicalProp];
      if (value == null || !isExpandableLogicalValue(value)) {
        continue;
      }
      const logicalIndex = entries.findIndex(([entryKey]) => entryKey === logicalProp);
      const physicalProps = LOGICAL_TO_PHYSICAL[logicalProp];
      if (physicalProps) {
        replacements.set(
          logicalProp,
          physicalProps.map((prop) => {
            const physicalIndex = entries.findIndex(([entryKey]) => entryKey === prop);
            if (physicalIndex >= 0) {
              replacements.set(prop, []);
            }
            return {
              prop,
              value: mergeLogicalPhysicalValues({
                logicalValue: value,
                physicalValue: style[prop],
                logicalIndex,
                physicalIndex,
                priorPhysicalValue: getPriorPhysicalValue(
                  key,
                  prop,
                  componentStyleEntries,
                  resolvedStyleObjects,
                ),
              }),
            };
          }),
        );
      }
    }
    if (replacements.size > 0) {
      replacePropsInPlace(style, replacements);
    }
  }
}

function getLogicalPropsForPhysicalFamily(physicalProps: string[]): string[] {
  const physicalSet = new Set(physicalProps);
  return Object.entries(LOGICAL_TO_PHYSICAL)
    .filter(([, mappedPhysicalProps]) => mappedPhysicalProps.some((prop) => physicalSet.has(prop)))
    .map(([logicalProp]) => logicalProp);
}

/**
 * Replace a shorthand property with expanded longhands in a style object.
 * Preserves property ordering by rebuilding the object with longhands
 * inserted where the shorthand was.
 * Uses logical form (block/inline) when the conflict is with logical properties,
 * otherwise uses physical form (top/right/bottom/left).
 */
function expandShorthandInStyle(
  style: Record<string, unknown>,
  shorthand: string,
  value: string | number,
  useLogical: boolean,
): void {
  // Build the replacement entries
  let replacements: Array<{ prop: string; value: unknown }>;

  // Parse the value to extract quad values (CSS shorthand notation: 1→all, 2→TB/LR,
  // 3→T/LR/B, 4→T/R/B/L).
  const rawStr = typeof value === "number" ? String(value) : value;
  const tokens = tokenizeShorthandValue(rawStr);
  const numOrStr = (v: string): string | number => (typeof value === "number" ? value : v);

  // Logical properties can only express block (top+bottom) and inline (left+right).
  // Only 1-value (all same) and 2-value (block/inline) patterns can map to logical.
  // For 3/4-value patterns, we must use physical longhands.
  const canUseLogical = tokens.length <= 2;

  if (useLogical && canUseLogical) {
    // Expand to logical longhands (block/inline) to match existing logical properties
    // in other style objects.
    const block = tokens[0] ?? rawStr;
    const inline = tokens[1] ?? block;
    replacements = [
      { prop: `${shorthand}Block`, value: numOrStr(block) },
      { prop: `${shorthand}Inline`, value: numOrStr(inline) },
    ];
  } else {
    // Physical expansion: always expand to 4 physical longhands (top/right/bottom/left).
    const top = tokens[0] ?? rawStr;
    const right = tokens[1] ?? top;
    const bottom = tokens[2] ?? top;
    const left = tokens[3] ?? right;
    replacements = [
      { prop: `${shorthand}Top`, value: numOrStr(top) },
      { prop: `${shorthand}Right`, value: numOrStr(right) },
      { prop: `${shorthand}Bottom`, value: numOrStr(bottom) },
      { prop: `${shorthand}Left`, value: numOrStr(left) },
    ];
  }

  replacePropsInPlace(style, new Map([[shorthand, replacements]]));
}

/**
 * Tokenize a CSS shorthand value into individual values, respecting CSS function
 * parentheses so that `calc(1px + 2px)` is treated as a single token.
 */
function tokenizeShorthandValue(value: string): string[] {
  const tokens: string[] = [];
  let current = "";
  let parenDepth = 0;

  for (let i = 0; i < value.length; i++) {
    const char = value[i]!;
    if (char === "(") {
      parenDepth++;
      current += char;
    } else if (char === ")") {
      parenDepth--;
      current += char;
    } else if (/\s/.test(char) && parenDepth === 0) {
      if (current.trim()) {
        tokens.push(current.trim());
        current = "";
      }
    } else {
      current += char;
    }
  }

  if (current.trim()) {
    tokens.push(current.trim());
  }

  return tokens;
}

function emitLocalDefineVarsSidecars(ctx: TransformContext, emittedStyleValues: unknown[]): void {
  const j = ctx.j;
  const vars = [...(ctx.localStylexVars?.values() ?? [])]
    .filter((ref) => emittedStyleValues.some((value) => containsLocalStylexVarRef(value, ref)))
    .sort((a, b) => a.sourceOrder - b.sourceOrder);
  if (vars.length === 0) {
    return;
  }

  ctx.sidecarFiles ??= [];
  const groups = groupLocalStylexVars(vars);
  const declarations = [...groups.entries()]
    .map(([groupName, refs]) => {
      const entries = refs
        .map((ref) => `  ${JSON.stringify(ref.keyName)}: ${JSON.stringify(ref.defaultValue)},`)
        .join("\n");
      return `export const ${groupName} = stylex.defineVars({\n${entries}\n});`;
    })
    .join("\n\n");
  ctx.sidecarFiles.push({
    content: `import * as stylex from "@stylexjs/stylex";\n\n${declarations}\n`,
  });

  const specifiers = [...groups.keys()].map((groupName) =>
    j.importSpecifier(j.identifier(groupName)),
  );
  insertImportDeclarationNearStylex(
    ctx.root,
    j.importDeclaration(specifiers, j.literal(`./${vars[0]?.sidecarFileName ?? "vars.stylex"}`)),
  );
}

function containsLocalStylexVarRef(value: unknown, ref: LocalStylexVarRef): boolean {
  if (!value || typeof value !== "object") {
    return false;
  }
  if (Array.isArray(value)) {
    return value.some((item) => containsLocalStylexVarRef(item, ref));
  }
  const record = value as Record<string, unknown>;
  if (record.type === "MemberExpression") {
    const object = record.object as { type?: string; name?: string } | undefined;
    const property = record.property as
      | { type?: string; name?: string; value?: unknown }
      | undefined;
    if (object?.type === "Identifier" && object.name === ref.groupName) {
      if (property?.type === "Identifier" && property.name === ref.keyName) {
        return true;
      }
      if (property?.type === "Literal" && property.value === ref.keyName) {
        return true;
      }
      if (property?.type === "StringLiteral" && property.value === ref.keyName) {
        return true;
      }
    }
  }
  for (const [key, child] of Object.entries(record)) {
    if (key === "loc" || key === "comments") {
      continue;
    }
    if (containsLocalStylexVarRef(child, ref)) {
      return true;
    }
  }
  return false;
}

function groupLocalStylexVars(vars: LocalStylexVarRef[]): Map<string, LocalStylexVarRef[]> {
  const groups = new Map<string, LocalStylexVarRef[]>();
  for (const ref of vars) {
    const refs = groups.get(ref.groupName) ?? [];
    refs.push(ref);
    groups.set(ref.groupName, refs);
  }
  return groups;
}

function isStylexMemberCallInit(init: unknown, methodName: string): boolean {
  if (!init || typeof init !== "object" || !("type" in init)) {
    return false;
  }
  const call = init as {
    type?: string;
    callee?: {
      type?: string;
      object?: { type?: string; name?: string };
      property?: { type?: string; name?: string };
    };
  };
  return (
    call.type === "CallExpression" &&
    call.callee?.type === "MemberExpression" &&
    call.callee.object?.type === "Identifier" &&
    call.callee.object.name === "stylex" &&
    call.callee.property?.type === "Identifier" &&
    call.callee.property.name === methodName
  );
}

function isStylexKeyframesInit(init: unknown): boolean {
  return isStylexMemberCallInit(init, "keyframes");
}

function isStylexCreateInit(init: unknown): boolean {
  return isStylexMemberCallInit(init, "create");
}

type VariableDeclarationLike = {
  type?: string;
  declarations?: Array<{ id?: { type?: string; name?: string }; init?: unknown }>;
};

function getVariableDeclarationFromStatement(statement: unknown): VariableDeclarationLike | null {
  if (!statement || typeof statement !== "object" || !("type" in statement)) {
    return null;
  }
  const typed = statement as {
    type?: string;
    declarations?: VariableDeclarationLike["declarations"];
    declaration?: VariableDeclarationLike;
  };
  if (typed.type === "VariableDeclaration") {
    return typed;
  }
  if (
    typed.type === "ExportNamedDeclaration" &&
    typed.declaration?.type === "VariableDeclaration"
  ) {
    return typed.declaration;
  }
  return null;
}

function variableDeclarationHasOnlyStylexKeyframes(decl: VariableDeclarationLike): boolean {
  if (decl.type !== "VariableDeclaration" || !decl.declarations?.length) {
    return false;
  }
  return decl.declarations.every((d) => isStylexKeyframesInit(d.init));
}

function getStylexKeyframesBindingNames(variableDecl: VariableDeclarationLike): Set<string> {
  const names = new Set<string>();
  for (const declarator of variableDecl.declarations ?? []) {
    if (
      declarator.id?.type === "Identifier" &&
      declarator.id.name &&
      isStylexKeyframesInit(declarator.init)
    ) {
      names.add(declarator.id.name);
    }
  }
  return names;
}

function statementReferencesAnyBinding(statement: unknown, bindingNames: Set<string>): boolean {
  if (bindingNames.size === 0) {
    return false;
  }
  const identifiers = new Set<string>();
  collectIdentifiers(statement, identifiers);
  for (const name of identifiers) {
    if (bindingNames.has(name)) {
      return true;
    }
  }
  return false;
}

function declaratorReferencesAnyBinding(
  declarator: { id?: { type?: string; name?: string }; init?: unknown },
  bindingNames: Set<string>,
): boolean {
  const identifiers = new Set<string>();
  collectIdentifiers(declarator.id, identifiers);
  collectIdentifiers(declarator.init, identifiers);
  for (const name of identifiers) {
    if (bindingNames.has(name)) {
      return true;
    }
  }
  return false;
}

function statementReferencesKeyframesBindingFromSurvivingDeclarators(
  statement: unknown,
  bindingNames: Set<string>,
  removedStyledDeclNames: Set<string>,
): boolean {
  const variableDecl = getVariableDeclarationFromStatement(statement);
  if (variableDecl?.declarations) {
    for (const declarator of variableDecl.declarations) {
      const id = declarator.id;
      if (id?.type === "Identifier" && id.name != null && removedStyledDeclNames.has(id.name)) {
        continue;
      }
      if (declaratorReferencesAnyBinding(declarator, bindingNames)) {
        return true;
      }
    }
    return false;
  }
  return statementReferencesAnyBinding(statement, bindingNames);
}

function interveningStatementUsesKeyframesBinding(
  statement: unknown,
  bindingNames: Set<string>,
  removedStyledDeclNames: Set<string>,
): boolean {
  return statementReferencesKeyframesBindingFromSurvivingDeclarators(
    statement,
    bindingNames,
    removedStyledDeclNames,
  );
}

function getTopLevelDeclaredBindingNames(statement: unknown): Set<string> {
  const names = new Set<string>();
  const variableDecl = getVariableDeclarationFromStatement(statement);
  if (variableDecl?.declarations) {
    for (const declarator of variableDecl.declarations) {
      const id = declarator.id;
      if (id?.type === "Identifier" && id.name) {
        names.add(id.name);
      } else if (id) {
        collectPatternBindingNames(id, names);
      }
    }
    return names;
  }
  const typed = statement as { type?: string; id?: { type?: string; name?: string } };
  if (typed.type === "FunctionDeclaration" && typed.id?.type === "Identifier" && typed.id.name) {
    names.add(typed.id.name);
  }
  return names;
}

function keyframesInitReferencesBindingsDeclaredBetween(
  variableDecl: VariableDeclarationLike,
  programBody: unknown[],
  rangeStart: number,
  rangeEnd: number,
): boolean {
  const referencedInInit = new Set<string>();
  for (const declarator of variableDecl.declarations ?? []) {
    collectIdentifiers(declarator.init, referencedInInit);
  }
  for (let index = rangeStart; index < rangeEnd; index++) {
    const declared = getTopLevelDeclaredBindingNames(programBody[index]);
    for (const name of declared) {
      if (referencedInInit.has(name)) {
        return true;
      }
    }
  }
  return false;
}

function getClassDeclarationFromStatement(
  statement: unknown,
): { id?: { type?: string; name?: string }; body?: { body?: unknown[] } } | null {
  if (!statement || typeof statement !== "object" || !("type" in statement)) {
    return null;
  }
  const typed = statement as {
    type?: string;
    id?: { type?: string; name?: string };
    body?: { body?: unknown[] };
    declaration?: {
      type?: string;
      id?: { type?: string; name?: string };
      body?: { body?: unknown[] };
    };
  };
  if (typed.type === "ClassDeclaration") {
    return typed;
  }
  if (typed.type === "ExportNamedDeclaration" && typed.declaration?.type === "ClassDeclaration") {
    return typed.declaration;
  }
  return null;
}

function classDeclarationCapturesKeyframes(
  classDecl: { id?: { type?: string; name?: string }; body?: { body?: unknown[] } },
  bindingNames: Set<string>,
): string | null {
  if (classDecl.id?.type !== "Identifier" || !classDecl.id.name) {
    return null;
  }
  const members = classDecl.body?.body;
  if (!Array.isArray(members)) {
    return null;
  }
  for (const member of members) {
    if (statementReferencesAnyBinding(member, bindingNames)) {
      return classDecl.id.name;
    }
  }
  return null;
}

function collectTopLevelBindingsCapturingKeyframes(
  programBody: unknown[],
  beforeIndex: number,
  bindingNames: Set<string>,
  removedStyledDeclNames: Set<string>,
): Set<string> {
  const captures = new Set<string>();
  for (let index = 0; index < beforeIndex; index++) {
    const statement = programBody[index];
    const classDecl = getClassDeclarationFromStatement(statement);
    if (classDecl) {
      const className = classDeclarationCapturesKeyframes(classDecl, bindingNames);
      if (className) {
        captures.add(className);
      }
      continue;
    }
    const variableDecl = getVariableDeclarationFromStatement(statement);
    if (variableDecl?.declarations) {
      for (const declarator of variableDecl.declarations) {
        const id = declarator.id;
        if (id?.type === "Identifier" && id.name != null && removedStyledDeclNames.has(id.name)) {
          continue;
        }
        if (!declaratorReferencesAnyBinding(declarator, bindingNames)) {
          continue;
        }
        if (id?.type === "Identifier" && id.name) {
          captures.add(id.name);
        } else if (id) {
          collectPatternBindingNames(id, captures);
        }
      }
      continue;
    }
    const typed = statement as {
      type?: string;
      id?: { type?: string; name?: string };
      body?: unknown;
    };
    if (typed.type === "FunctionDeclaration" && typed.id?.type === "Identifier" && typed.id.name) {
      if (statementReferencesAnyBinding(typed.body, bindingNames)) {
        captures.add(typed.id.name);
      }
    }
  }
  return captures;
}

function canSafelyRelocateKeyframesStatement(
  statementIndex: number,
  anchorIndex: number,
  programBody: unknown[],
  variableDecl: VariableDeclarationLike,
  removedStyledDeclNames: Set<string>,
): boolean {
  const bindingNames = getStylexKeyframesBindingNames(variableDecl);
  const rangeStart = Math.min(statementIndex, anchorIndex);
  const rangeEnd = Math.max(statementIndex, anchorIndex);
  if (
    statementIndex > anchorIndex &&
    keyframesInitReferencesBindingsDeclaredBetween(
      variableDecl,
      programBody,
      anchorIndex,
      statementIndex,
    )
  ) {
    return false;
  }
  if (
    statementIndex < anchorIndex &&
    keyframesInitReferencesBindingsDeclaredBetween(
      variableDecl,
      programBody,
      statementIndex + 1,
      anchorIndex,
    )
  ) {
    return false;
  }
  const indirectCaptureNames =
    statementIndex < anchorIndex
      ? collectTopLevelBindingsCapturingKeyframes(
          programBody,
          statementIndex,
          bindingNames,
          removedStyledDeclNames,
        )
      : new Set<string>();
  for (let index = rangeStart; index < rangeEnd; index++) {
    if (index === statementIndex) {
      continue;
    }
    const statement = programBody[index];
    if (interveningStatementUsesKeyframesBinding(statement, bindingNames, removedStyledDeclNames)) {
      return false;
    }
    if (
      indirectCaptureNames.size > 0 &&
      interveningStatementUsesKeyframesBinding(
        statement,
        indirectCaptureNames,
        removedStyledDeclNames,
      )
    ) {
      return false;
    }
  }
  return true;
}

function extractModuleLevelStylexKeyframesStatements(
  programBody: unknown[],
  anchorIndex: number,
  removedStyledDeclNames: Set<string>,
): { statements: unknown[]; insertIndex: number } {
  const extracted: Array<{ index: number; statement: unknown }> = [];
  for (let index = 0; index < programBody.length; index++) {
    const statement = programBody[index];
    const variableDecl = getVariableDeclarationFromStatement(statement);
    if (!variableDecl || !variableDeclarationHasOnlyStylexKeyframes(variableDecl)) {
      continue;
    }
    if (
      !canSafelyRelocateKeyframesStatement(
        index,
        anchorIndex,
        programBody,
        variableDecl,
        removedStyledDeclNames,
      )
    ) {
      continue;
    }
    extracted.push({ index, statement });
  }
  extracted.sort((a, b) => a.index - b.index);
  let insertIndex = anchorIndex;
  for (let i = extracted.length - 1; i >= 0; i--) {
    const { index } = extracted[i]!;
    if (index < insertIndex) {
      insertIndex--;
    }
    programBody.splice(index, 1);
  }
  return { statements: extracted.map((entry) => entry.statement), insertIndex };
}

function findMainStylexCreateStatementIndex(
  programBody: unknown[],
  stylesIdentifier: string,
): number {
  for (let index = 0; index < programBody.length; index++) {
    const variableDecl = getVariableDeclarationFromStatement(programBody[index]);
    if (!variableDecl?.declarations) {
      continue;
    }
    for (const declarator of variableDecl.declarations) {
      if (
        declarator.id?.type === "Identifier" &&
        declarator.id.name === stylesIdentifier &&
        isStylexCreateInit(declarator.init)
      ) {
        return index;
      }
    }
  }
  return -1;
}

function resolveStylesAnchorIndex(args: {
  programBody: unknown[];
  stylesInsertPosition: "end" | "afterImports";
  stylesIdentifier: string;
  mergeTarget: TransformContext["existingStylexStylesTarget"];
  willInsertStylesDecl: boolean;
}): number {
  const { programBody, stylesInsertPosition, stylesIdentifier, mergeTarget, willInsertStylesDecl } =
    args;

  if (mergeTarget || !willInsertStylesDecl) {
    const existingIndex = findMainStylexCreateStatementIndex(programBody, stylesIdentifier);
    if (existingIndex >= 0) {
      return existingIndex;
    }
  }

  if (stylesInsertPosition === "afterImports") {
    const lastImportIdx = findLastImportIndex(programBody as any[]);
    return lastImportIdx >= 0 ? lastImportIdx + 1 : 0;
  }

  return programBody.length;
}

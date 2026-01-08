import type { Collection } from "jscodeshift";
import type { StyledDecl } from "./transform-types.js";
import path from "node:path";
import type { ImportSource, ImportSpec } from "../adapter.js";

export function emitStylesAndImports(args: {
  root: Collection<any>;
  j: any;
  filePath: string;
  styledImports: Collection<any>;
  resolverImports: Map<string, any>;
  resolvedStyleObjects: Map<string, any>;
  styledDecls: StyledDecl[];
  cssHelperNames: Set<string>;
  isAstNode: (v: unknown) => boolean;
  objectToAst: (j: any, v: Record<string, unknown>) => any;
  literalToAst: (j: any, v: unknown) => any;
}): void {
  const {
    root,
    j,
    filePath,
    styledImports,
    resolverImports,
    resolvedStyleObjects,
    styledDecls,
    cssHelperNames,
    isAstNode,
    objectToAst,
    literalToAst,
  } = args;

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
    // Include the full contiguous comment array from the first "Bug ..." comment onward.
    // This captures follow-up lines like:
    //   // Bug N: ...
    //   // more context...
    return {
      narrative: (comments as any[]).slice(bugIdx),
      property: (comments as any[]).slice(0, bugIdx),
    };
  };

  // Remove styled-components import(s), but preserve any named imports that are still referenced
  // (e.g. useTheme, withTheme, ThemeProvider if they're still used in the code)
  const preservedSpecifiers: string[] = [];
  for (const importNode of styledImports.nodes()) {
    const specifiers = (importNode as any).specifiers ?? [];
    for (const spec of specifiers) {
      // Skip default import (styled) and namespace imports
      if (spec.type !== "ImportSpecifier") {
        continue;
      }
      const localName = spec.local?.name ?? spec.imported?.name;
      if (!localName) {
        continue;
      }
      // Check if this import is still referenced elsewhere in the code
      // Skip common styled-components exports that are being transformed away
      const transformedAway = ["styled", "css", "keyframes", "createGlobalStyle"];
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

  // Remove styled-components imports
  styledImports.remove();

  // Re-add preserved imports from styled-components if any
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

  // Insert stylex import at top (after existing imports, before code)
  const hasStylexImport =
    root.find(j.ImportDeclaration, { source: { value: "@stylexjs/stylex" } } as any).size() > 0;
  if (!hasStylexImport) {
    const firstImport = root.find(j.ImportDeclaration).at(0);
    const stylexImport = j.importDeclaration(
      [j.importNamespaceSpecifier(j.identifier("stylex"))],
      j.literal("@stylexjs/stylex"),
    );
    if (firstImport.size() > 0) {
      firstImport.insertBefore(stylexImport);
    } else {
      root.get().node.program.body.unshift(stylexImport);
    }
  }

  // Re-attach preserved header comments to the first statement (preferably the stylex import).
  if (preservedHeaderComments.length > 0) {
    const body = root.get().node.program.body as any[];
    if (body.length > 0) {
      const firstStmt = body[0]!;
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
  for (const d of declsByLoc) {
    const cs = (d as any).leadingComments;
    if (!Array.isArray(cs) || cs.length === 0) {
      continue;
    }
    const { narrative } = splitBugNarrativeLeadingComments(cs);
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

  // Inject resolver-provided imports (from adapter.resolveValue calls).
  {
    const toModuleSpecifier = (from: ImportSource): string => {
      if (from.kind === "specifier") {
        if (typeof from.value !== "string" || from.value.trim() === "") {
          throw new Error(
            `[styled-components-to-stylex] Invalid import specifier: expected non-empty string, got ${JSON.stringify(
              from.value,
            )}`,
          );
        }
        return from.value;
      }
      // Absolute file path -> relative module specifier from current file
      if (typeof from.value !== "string" || from.value.trim() === "") {
        throw new Error(
          `[styled-components-to-stylex] Invalid import absolutePath: expected non-empty string, got ${JSON.stringify(
            from.value,
          )}`,
        );
      }
      if (!path.isAbsolute(from.value)) {
        throw new Error(
          `[styled-components-to-stylex] Invalid import absolutePath: expected absolute path, got ${JSON.stringify(
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
  }

  // Build a map from styleKey to leadingComments for comment preservation
  const styleKeyToComments = new Map<string, any[]>();
  for (const decl of styledDecls) {
    if (decl.leadingComments && decl.leadingComments.length > 0) {
      // Avoid attaching "Bug N:" narrative comments to a specific style property inside
      // `stylex.create({ ... })` — those belong above the `styles` declaration instead.
      const { property } = splitBugNarrativeLeadingComments(decl.leadingComments);
      if (property.length > 0) {
        styleKeyToComments.set(decl.styleKey, property);
      }
    }
  }

  // Insert `const styles = stylex.create(...)` near top (after imports)
  const stylesDecl = j.variableDeclaration("const", [
    j.variableDeclarator(
      j.identifier("styles"),
      j.callExpression(j.memberExpression(j.identifier("stylex"), j.identifier("create")), [
        j.objectExpression(
          [...resolvedStyleObjects.entries()].map(([k, v]) => {
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

  // If styles reference identifiers declared later in the file (e.g. string-interpolation fixture),
  // insert `styles` after the last such declaration to satisfy StyleX evaluation order.
  const referencedIdents = new Set<string>();
  {
    const seen = new WeakSet<object>();
    const visit = (cur: any) => {
      if (!cur) {
        return;
      }
      if (Array.isArray(cur)) {
        for (const c of cur) {
          visit(c);
        }
        return;
      }
      if (typeof cur !== "object") {
        return;
      }
      if (seen.has(cur as object)) {
        return;
      }
      seen.add(cur as object);
      if (cur.type === "Identifier" && typeof cur.name === "string") {
        referencedIdents.add(cur.name);
      }
      for (const v of Object.values(cur)) {
        if (typeof v === "object") {
          visit(v);
        }
      }
    };
    for (const v of resolvedStyleObjects.values()) {
      if (isAstNode(v)) {
        visit(v);
      } else if (v && typeof v === "object") {
        visit(objectToAst(j, v as any));
      }
    }
  }

  const programBody = root.get().node.program.body as any[];
  const declsRefIdx = (() => {
    let last = -1;
    for (let i = 0; i < programBody.length; i++) {
      const stmt = programBody[i];
      if (!stmt) {
        continue;
      }
      if (stmt.type === "VariableDeclaration") {
        for (const d of stmt.declarations ?? []) {
          const id = d?.id;
          if (id?.type === "Identifier" && referencedIdents.has(id.name)) {
            last = i;
          }
        }
      } else if (stmt.type === "FunctionDeclaration") {
        const id = stmt.id;
        if (id?.type === "Identifier" && referencedIdents.has(id.name)) {
          last = i;
        }
      }
    }
    return last >= 0 ? last : null;
  })();

  // Try to place `styles` where the first styled component declaration used to be:
  // insert right before the earliest styled decl statement (i.e. after the statement before it).
  const firstStyledDeclInsertionAfterIdx = (() => {
    if (!styledDecls.length) {
      return null;
    }
    const styledLocalNames = new Set(styledDecls.map((d) => d.localName));
    let firstIdx: number | null = null;
    for (let i = 0; i < programBody.length; i++) {
      const stmt = programBody[i];
      if (stmt?.type !== "VariableDeclaration") {
        continue;
      }
      for (const d of stmt.declarations ?? []) {
        const id = d?.id;
        if (id?.type !== "Identifier") {
          continue;
        }
        if (!styledLocalNames.has(id.name)) {
          continue;
        }
        firstIdx = firstIdx === null ? i : Math.min(firstIdx, i);
      }
    }
    return firstIdx === null ? null : firstIdx - 1;
  })();

  const lastImportIdx = (() => {
    let last = -1;
    for (let i = 0; i < programBody.length; i++) {
      if (programBody[i]?.type === "ImportDeclaration") {
        last = i;
      }
    }
    return last;
  })();

  const lastKeyframesIdx = (() => {
    let last = -1;
    for (let i = 0; i < programBody.length; i++) {
      const stmt = programBody[i];
      if (stmt?.type !== "VariableDeclaration") {
        continue;
      }
      for (const d of stmt.declarations ?? []) {
        const init: any = d?.init;
        if (
          init &&
          init.type === "CallExpression" &&
          init.callee?.type === "MemberExpression" &&
          init.callee.object?.type === "Identifier" &&
          init.callee.object.name === "stylex" &&
          init.callee.property?.type === "Identifier" &&
          init.callee.property.name === "keyframes"
        ) {
          last = i;
        }
      }
    }
    return last;
  })();

  const lastCssHelperIdx = (() => {
    let last = -1;
    for (let i = 0; i < programBody.length; i++) {
      const stmt = programBody[i];
      if (stmt?.type !== "VariableDeclaration") {
        continue;
      }
      for (const d of stmt.declarations ?? []) {
        const id: any = d?.id;
        if (id?.type === "Identifier" && cssHelperNames.has(id.name)) {
          last = i;
        }
      }
    }
    return last;
  })();

  // Pick the latest safe insertion point: after imports, after any keyframes/css helpers,
  // after any referenced identifier declarations, and after the original styled-decl anchor.
  const insertAfterIdx = Math.max(
    lastImportIdx,
    lastKeyframesIdx,
    lastCssHelperIdx,
    declsRefIdx ?? -1,
    firstStyledDeclInsertionAfterIdx ?? -1,
  );

  if (insertAfterIdx >= 0) {
    programBody.splice(insertAfterIdx + 1, 0, stylesDecl as any);
  } else {
    programBody.unshift(stylesDecl as any);
  }
}

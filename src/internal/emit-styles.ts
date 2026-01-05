import type { Collection } from "jscodeshift";
import type { StyledDecl } from "./transform-types.js";

export function emitStylesAndImports(args: {
  root: Collection<any>;
  j: any;
  styledImports: Collection<any>;
  resolverImports: Set<string>;
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
    if (!Array.isArray(comments)) return;
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

  // Remove styled-components import(s)
  styledImports.remove();

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
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
      (firstStmt as any).leadingComments = deduped;
      (firstStmt as any).comments = deduped;
    }
  }

  // Inject resolver-provided imports (from adapter.resolveValue calls).
  {
    const importsToInject = new Set<string>(resolverImports);

    const parseStatements = (src: string): any[] => {
      try {
        const program = j(src).get().node.program;
        return Array.isArray((program as any).body) ? ((program as any).body as any[]) : [];
      } catch {
        return [];
      }
    };

    const existingImportSources = new Set(
      root
        .find(j.ImportDeclaration)
        .nodes()
        .map((n: any) => (n.source as any)?.value)
        .filter((v: any): v is string => typeof v === "string"),
    );

    const importNodes: any[] = [];
    for (const imp of importsToInject) {
      for (const stmt of parseStatements(imp)) {
        if (stmt?.type !== "ImportDeclaration") continue;
        const src = (stmt.source as any)?.value;
        if (typeof src === "string" && existingImportSources.has(src)) continue;
        if (typeof src === "string") existingImportSources.add(src);
        importNodes.push(stmt);
      }
    }

    if (importNodes.length) {
      const body = root.get().node.program.body as any[];
      const stylexIdx = body.findIndex(
        (s) => s?.type === "ImportDeclaration" && (s.source as any)?.value === "@stylexjs/stylex",
      );
      const lastImportIdx = (() => {
        let last = -1;
        for (let i = 0; i < body.length; i++) {
          if (body[i]?.type === "ImportDeclaration") last = i;
        }
        return last;
      })();

      // Insert imports immediately after the stylex import (preferred) or after the last import.
      const importInsertAt =
        stylexIdx >= 0 ? stylexIdx + 1 : lastImportIdx >= 0 ? lastImportIdx + 1 : 0;
      if (importNodes.length) body.splice(importInsertAt, 0, ...importNodes);
    }
  }

  // Build a map from styleKey to leadingComments for comment preservation
  const styleKeyToComments = new Map<string, any[]>();
  for (const decl of styledDecls) {
    if (decl.leadingComments && decl.leadingComments.length > 0) {
      styleKeyToComments.set(decl.styleKey, decl.leadingComments);
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

  const lastKeyframesOrHelperDecl = root
    .find(j.VariableDeclaration)
    .filter((p: any) =>
      p.node.declarations.some((d: any) => {
        const init: any = (d as any).init;
        return (
          init &&
          init.type === "CallExpression" &&
          init.callee?.type === "MemberExpression" &&
          init.callee.object?.type === "Identifier" &&
          init.callee.object.name === "stylex" &&
          init.callee.property?.type === "Identifier" &&
          init.callee.property.name === "keyframes"
        );
      }),
    )
    .at(-1);

  const lastCssHelperDecl = root
    .find(j.VariableDeclaration)
    .filter((p: any) =>
      p.node.declarations.some((d: any) => {
        const id: any = (d as any).id;
        return id?.type === "Identifier" && cssHelperNames.has(id.name);
      }),
    )
    .at(-1);

  const insertionAnchor = lastKeyframesOrHelperDecl.size()
    ? lastKeyframesOrHelperDecl
    : lastCssHelperDecl.size()
      ? lastCssHelperDecl
      : null;

  // If styles reference identifiers declared later in the file (e.g. string-interpolation fixture),
  // insert `styles` after the last such declaration to satisfy StyleX evaluation order.
  const referencedIdents = new Set<string>();
  {
    const seen = new WeakSet<object>();
    const visit = (cur: any) => {
      if (!cur) return;
      if (Array.isArray(cur)) {
        for (const c of cur) visit(c);
        return;
      }
      if (typeof cur !== "object") return;
      if (seen.has(cur as object)) return;
      seen.add(cur as object);
      if (cur.type === "Identifier" && typeof cur.name === "string") {
        referencedIdents.add(cur.name);
      }
      for (const v of Object.values(cur)) {
        if (typeof v === "object") visit(v);
      }
    };
    for (const v of resolvedStyleObjects.values()) {
      if (isAstNode(v)) visit(v);
      else if (v && typeof v === "object") visit(objectToAst(j, v as any));
    }
  }

  const programBody = root.get().node.program.body as any[];
  const declsRefIdx = (() => {
    let last = -1;
    for (let i = 0; i < programBody.length; i++) {
      const stmt = programBody[i];
      if (!stmt) continue;
      if (stmt.type === "VariableDeclaration") {
        for (const d of stmt.declarations ?? []) {
          const id = d?.id;
          if (id?.type === "Identifier" && referencedIdents.has(id.name)) last = i;
        }
      } else if (stmt.type === "FunctionDeclaration") {
        const id = stmt.id;
        if (id?.type === "Identifier" && referencedIdents.has(id.name)) last = i;
      }
    }
    return last >= 0 ? last : null;
  })();

  if (declsRefIdx !== null) {
    programBody.splice(declsRefIdx + 1, 0, stylesDecl as any);
  } else if (insertionAnchor) {
    insertionAnchor.insertAfter(stylesDecl);
  } else {
    const lastImport = root.find(j.ImportDeclaration).at(-1);
    if (lastImport.size() > 0) {
      lastImport.insertAfter(stylesDecl);
    } else {
      root.get().node.program.body.unshift(stylesDecl);
    }
  }
}

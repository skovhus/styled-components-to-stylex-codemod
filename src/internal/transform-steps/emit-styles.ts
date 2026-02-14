/**
 * Step: emit stylex.create objects and resolver imports.
 * Core concepts: style emission and import aliasing.
 */
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
    emitDefineMarkerDeclarations(ctx);
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

/** Emit `const __XMarker = stylex.defineMarker()` declarations at module scope. */
function emitDefineMarkerDeclarations(ctx: TransformContext): void {
  const j = ctx.j;
  const programBody = ctx.root.get().node.program.body as Array<{ type?: string }>;
  // Insert after imports, before component code
  const lastImportIdx = programBody.reduce(
    (last: number, node: { type?: string }, i: number) =>
      node?.type === "ImportDeclaration" ? i : last,
    -1,
  );
  const insertAt = lastImportIdx >= 0 ? lastImportIdx + 1 : 0;

  let offset = 0;
  for (const [, markerVarName] of ctx.crossFileMarkers!) {
    const markerDecl = j.variableDeclaration("const", [
      j.variableDeclarator(
        j.identifier(markerVarName),
        j.callExpression(
          j.memberExpression(j.identifier("stylex"), j.identifier("defineMarker")),
          [],
        ),
      ),
    ]);
    programBody.splice(insertAt + offset, 0, markerDecl as { type?: string });
    offset++;
  }
}

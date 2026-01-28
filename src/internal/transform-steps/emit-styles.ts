import { emitStylesAndImports } from "../emit-styles.js";
import { CONTINUE, type StepResult } from "../transform-types.js";
import type { StyledDecl } from "../transform-types.js";
import { TransformContext } from "../transform-context.js";
import { literalToAst, objectToAst } from "../transform/helpers.js";

/**
 * Emits stylex.create objects and required imports, applying resolver import aliasing.
 */
export function emitStylesStep(ctx: TransformContext): StepResult {
  const styledDecls = ctx.styledDecls as StyledDecl[] | undefined;
  const styledImports = ctx.styledImports;
  if (!styledDecls || !styledImports) {
    return CONTINUE;
  }

  const { emptyStyleKeys } = emitStylesAndImports({
    root: ctx.root,
    j: ctx.j,
    filePath: ctx.file.path,
    styledImports,
    resolverImports: ctx.resolverImports,
    resolvedStyleObjects: ctx.resolvedStyleObjects ?? new Map(),
    styledDecls,
    objectToAst,
    literalToAst,
    stylesIdentifier: ctx.stylesIdentifier ?? "styles",
    styleMerger: ctx.adapter.styleMerger,
  });
  ctx.emptyStyleKeys = emptyStyleKeys;
  ctx.markChanged();

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

/**
 * Inserts emitted wrapper nodes into the AST and preserves comments.
 * Core concepts: wrapper ordering and React type import management.
 */
import nodePath from "node:path";
import type { ASTNode, Comment } from "jscodeshift";
import type { ImportSource } from "../../adapter.js";
import type { WrapperEmitter } from "./wrapper-emitter.js";
import { ensureReactBinding } from "../utilities/ensure-react-binding.js";
import { extractDefaultAsTagFromDestructure } from "../utilities/polymorphic-as-detection.js";

export function insertEmittedWrappers(args: {
  emitter: WrapperEmitter;
  emitted: ASTNode[];
  needsReactTypeImport: boolean;
  needsUseThemeImport?: boolean;
}): void {
  const { emitter, emitted, needsReactTypeImport, needsUseThemeImport } = args;
  const { root, j, wrapperDecls, exportedComponents, emitTypes } = emitter;

  if (emitted.length > 0) {
    // Re-order emitted wrapper nodes to match `wrapperDecls` source order.
    const groups = new Map<string, ASTNode[]>();
    const restNodes: ASTNode[] = [];

    const pushGroup = (name: string, node: ASTNode) => {
      groups.set(name, [...(groups.get(name) ?? []), node]);
    };

    for (const node of emitted) {
      if (node?.type === "TSTypeAliasDeclaration") {
        const name = node.id?.type === "Identifier" ? node.id.name : null;
        if (name && name.endsWith("Props")) {
          const base = name.slice(0, -5);
          if (wrapperDecls.some((d) => d.localName === base)) {
            pushGroup(base, node);
            continue;
          }
        }
        restNodes.push(node);
        continue;
      }
      if (node?.type === "FunctionDeclaration" && node.id?.type === "Identifier") {
        pushGroup(node.id.name, node);
        continue;
      }
      restNodes.push(node);
    }

    const ordered: ASTNode[] = [];
    for (const d of wrapperDecls) {
      const chunk = groups.get(d.localName);
      if (chunk?.length) {
        ordered.push(...chunk);
      }
    }
    for (const [name, chunk] of groups.entries()) {
      if (wrapperDecls.some((d) => d.localName === name)) {
        continue;
      }
      ordered.push(...chunk);
    }
    ordered.push(...restNodes);

    // Wrap function declarations in export statements for exported components
    const wrappedOrdered = ordered.map((node) => {
      if (node?.type !== "FunctionDeclaration") {
        return node;
      }

      // Safety net: if a wrapper destructures `as: Component = "<tag>"` AND has a props
      // type that uses generics (e.g., `Props<C>`), add the missing type parameters.
      //
      // This protects against emitter paths that annotate props as `<C>` but forget to
      // attach the function's `typeParameters`.
      //
      // Note: We only add generics if the props type reference uses generics. For simple
      // `as?: React.ElementType` support (non-exported components), we don't add generics.
      if (!(node as any).typeParameters) {
        // Check if the props type annotation uses generics (e.g., `Props<C>`)
        const propsTypeUsesGeneric = (() => {
          const params = (node as any).params ?? [];
          if (!Array.isArray(params) || params.length === 0) {
            return false;
          }
          const firstParam = params[0];
          const typeAnn = firstParam?.typeAnnotation?.typeAnnotation;
          if (!typeAnn) {
            return false;
          }
          // Check for `Props<C>` pattern
          if (typeAnn.type === "TSTypeReference" && typeAnn.typeParameters?.params?.length > 0) {
            return true;
          }
          return false;
        })();

        if (propsTypeUsesGeneric) {
          const defaultTag = extractDefaultAsTagFromDestructure(node);
          if (defaultTag) {
            (node as any).typeParameters = j(
              `function _<C extends React.ElementType = "${defaultTag}">() { return null }`,
            ).get().node.program.body[0].typeParameters;
          }
        }
      }

      const fnName = typeof node.id?.name === "string" ? node.id.name : null;
      if (!fnName) {
        return node;
      }
      const exportInfo = exportedComponents.get(fnName);
      if (!exportInfo) {
        return node;
      }
      // If exported via specifier (export { Button }), don't add export to the function
      // because the re-export statement is preserved and handles the export.
      if (exportInfo.isSpecifier) {
        return node;
      }
      // Move leading comments from the inner function to the outer export declaration
      // to avoid generating "export <comment> function X"
      const commentable = node as ASTNode & { leadingComments?: Comment[]; comments?: Comment[] };
      const leadingComments = commentable.leadingComments ?? commentable.comments;
      if (leadingComments) {
        commentable.leadingComments = undefined;
        commentable.comments = undefined;
      }

      let exportNode: ASTNode;
      if (exportInfo.isDefault) {
        // Create: export default function X(...) { ... }
        exportNode = j.exportDefaultDeclaration(node);
      } else {
        // Create: export function X(...) { ... }
        exportNode = j.exportNamedDeclaration(node, [], null);
      }

      // Attach comments to the export declaration instead
      if (leadingComments) {
        const exportCommentable = exportNode as ASTNode & {
          leadingComments?: Comment[];
          comments?: Comment[];
        };
        exportCommentable.leadingComments = leadingComments;
        exportCommentable.comments = leadingComments;
      }

      return exportNode;
    });

    // Replace each styled declaration in-place with its wrapper function.
    // This preserves the original position of components in the file.
    for (const d of wrapperDecls) {
      const wrapperNodes = wrappedOrdered.filter((node: ASTNode) => {
        if (node?.type === "FunctionDeclaration") {
          return node.id?.name === d.localName;
        }
        if (node?.type === "ExportNamedDeclaration" || node?.type === "ExportDefaultDeclaration") {
          const decl = node.declaration;
          return decl?.type === "FunctionDeclaration" && decl.id?.name === d.localName;
        }
        if (node?.type === "TSTypeAliasDeclaration") {
          const name = node.id?.name;
          return name === `${d.localName}Props`;
        }
        return false;
      });

      if (wrapperNodes.length === 0) {
        continue;
      }

      // Find the original styled declaration
      const styledDecl = root
        .find(j.VariableDeclaration)
        .filter((p: any) =>
          p.node.declarations.some(
            (dcl: any) =>
              dcl.type === "VariableDeclarator" &&
              dcl.id?.type === "Identifier" &&
              dcl.id.name === d.localName,
          ),
        );

      if (styledDecl.size() > 0) {
        // Check if it's inside an export declaration
        const firstPath = styledDecl.paths()[0];
        const parent = firstPath?.parentPath;
        if (parent && parent.node?.type === "ExportNamedDeclaration") {
          // Replace the export declaration
          j(parent).replaceWith(wrapperNodes);
        } else {
          // Replace the variable declaration
          styledDecl.at(0).replaceWith(wrapperNodes);
        }
      }
    }

    // Insert any remaining nodes (types not associated with a specific wrapper) before styles
    const insertedNames = new Set(wrapperDecls.map((d) => d.localName));
    const remainingNodes = wrappedOrdered.filter((node: any) => {
      if (node?.type === "FunctionDeclaration") {
        return !insertedNames.has(node.id?.name);
      }
      if (node?.type === "ExportNamedDeclaration" || node?.type === "ExportDefaultDeclaration") {
        const decl = node.declaration;
        return !(decl?.type === "FunctionDeclaration" && insertedNames.has(decl.id?.name));
      }
      if (node?.type === "TSTypeAliasDeclaration") {
        const name = node.id?.name;
        if (name?.endsWith("Props")) {
          const base = name.slice(0, -5);
          return !insertedNames.has(base);
        }
      }
      return true;
    });

    if (remainingNodes.length > 0) {
      root
        .find(j.VariableDeclaration)
        .filter((p: any) =>
          p.node.declarations.some(
            (dcl: any) => dcl.type === "VariableDeclarator" && (dcl.id as any)?.name === "styles",
          ),
        )
        .at(0)
        .insertBefore(remainingNodes);
    }
  }

  if (emitTypes && needsReactTypeImport) {
    ensureReactBinding({ root, j, useNamespaceStyle: true });
  }

  if (
    emitTypes &&
    emitter.emitOpaquePolymorphicHelpersExternally &&
    emitter.needsOpaquePolymorphicHelpers &&
    emitter.typeHelpersModuleSpecifier
  ) {
    ensureTypeImportSpecifier({
      root,
      j,
      moduleSpecifier: emitter.typeHelpersModuleSpecifier,
      typeName: "__StylexCodemodOpaquePolymorphicProps",
    });
  }

  // Add configured theme hook import when needed for theme boolean conditionals.
  if (needsUseThemeImport) {
    const { functionName: themeHookFunctionName, importSource: themeHookImportSource } =
      emitter.themeHook;
    const themeHookModuleSpecifier = toModuleSpecifier(themeHookImportSource, emitter.filePath);

    // Check runtime imports from the configured module.
    const runtimeImports = root
      .find(j.ImportDeclaration, {
        source: { value: themeHookModuleSpecifier },
      } as any)
      .filter((path: any) => path.node.importKind !== "type");

    const hasThemeHookSpecifier =
      runtimeImports
        .find(j.ImportSpecifier)
        .filter((specifierPath: any) => {
          const importedName =
            specifierPath.node.imported?.name ?? specifierPath.node.imported?.value;
          const localName = specifierPath.node.local?.name ?? importedName;
          // Local binding identity is what matters for wrapper calls.
          // Aliased imports like `import { useDesignTheme as useTheme } ...`
          // already provide the `useTheme` local symbol and should not trigger injection.
          return localName === themeHookFunctionName;
        })
        .size() > 0;

    if (!hasThemeHookSpecifier) {
      // Prefer appending to an existing import declaration that can host named specifiers.
      const importWithoutNamespaceSpecifier = runtimeImports.filter(
        (importPath: any) =>
          !((importPath.node.specifiers ?? []) as any[]).some(
            (specifier: any) => specifier?.type === "ImportNamespaceSpecifier",
          ),
      );

      if (importWithoutNamespaceSpecifier.size() > 0) {
        importWithoutNamespaceSpecifier.at(0).forEach((path: any) => {
          const specifiers = path.node.specifiers ?? [];
          specifiers.push(j.importSpecifier(j.identifier(themeHookFunctionName)));
        });
      } else {
        const themeHookImport = j.importDeclaration(
          [j.importSpecifier(j.identifier(themeHookFunctionName))],
          j.literal(themeHookModuleSpecifier),
        );

        // If the module is already imported via namespace import, place the new named import
        // after the last import from the same module to keep imports grouped.
        if (runtimeImports.size() > 0) {
          runtimeImports.at(runtimeImports.size() - 1).insertAfter(themeHookImport);
        } else {
          // Insert after the first import.
          const firstImport = root.find(j.ImportDeclaration).at(0);
          if (firstImport.size() > 0) {
            firstImport.insertAfter(themeHookImport);
          } else {
            root.get().node.program.body.unshift(themeHookImport);
          }
        }
      }
    }
  }
}

function toModuleSpecifier(from: ImportSource, filePath: string): string {
  if (from.kind === "specifier") {
    return from.value;
  }
  const baseDir = nodePath.dirname(String(filePath));
  let relativePath = nodePath.relative(baseDir, from.value);
  relativePath = relativePath.split(nodePath.sep).join("/");
  if (!relativePath.startsWith(".")) {
    relativePath = `./${relativePath}`;
  }
  return relativePath;
}

function ensureTypeImportSpecifier(args: {
  root: WrapperEmitter["root"];
  j: WrapperEmitter["j"];
  moduleSpecifier: string;
  typeName: string;
}): void {
  const { root, j, moduleSpecifier, typeName } = args;
  const importsFromModule = root.find(j.ImportDeclaration, {
    source: { value: moduleSpecifier },
  } as any);
  const hasTypeSpecifier =
    importsFromModule
      .find(j.ImportSpecifier)
      .filter((specifierPath: any) => {
        const importedName =
          specifierPath.node.imported?.name ?? specifierPath.node.imported?.value;
        const localName = specifierPath.node.local?.name ?? importedName;
        return localName === typeName;
      })
      .size() > 0;
  if (hasTypeSpecifier) {
    return;
  }
  const typeImport = j.importDeclaration(
    [j.importSpecifier(j.identifier(typeName))],
    j.literal(moduleSpecifier),
  );
  (typeImport as any).importKind = "type";
  if (importsFromModule.size() > 0) {
    importsFromModule.at(importsFromModule.size() - 1).insertAfter(typeImport);
    return;
  }
  const firstImport = root.find(j.ImportDeclaration).at(0);
  if (firstImport.size() > 0) {
    firstImport.insertAfter(typeImport);
    return;
  }
  root.get().node.program.body.unshift(typeImport);
}

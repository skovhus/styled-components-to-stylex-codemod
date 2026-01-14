import type { Collection } from "jscodeshift";
import type { StyledDecl } from "../transform-types.js";
import type { ExportInfo } from "./types.js";

export function insertEmittedWrappers(args: {
  root: Collection<any>;
  j: any;
  emitted: any[];
  wrapperDecls: StyledDecl[];
  exportedComponents: Map<string, ExportInfo>;
  emitTypes: boolean;
  needsReactTypeImport: boolean;
}): void {
  const { root, j, emitted, wrapperDecls, exportedComponents, emitTypes, needsReactTypeImport } =
    args;

  if (emitted.length > 0) {
    // Re-order emitted wrapper nodes to match `wrapperDecls` source order.
    const groups = new Map<string, any[]>();
    const restNodes: any[] = [];

    const pushGroup = (name: string, node: any) => {
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

    const ordered: any[] = [];
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
      const fnName = node.id?.name;
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
      const leadingComments = (node as any).leadingComments ?? (node as any).comments;
      if (leadingComments) {
        (node as any).leadingComments = undefined;
        (node as any).comments = undefined;
      }

      let exportNode: any;
      if (exportInfo.isDefault) {
        // Create: export default function X(...) { ... }
        exportNode = j.exportDefaultDeclaration(node);
      } else {
        // Create: export function X(...) { ... }
        exportNode = j.exportNamedDeclaration(node, [], null);
      }

      // Attach comments to the export declaration instead
      if (leadingComments) {
        exportNode.leadingComments = leadingComments;
        exportNode.comments = leadingComments;
      }

      return exportNode;
    });

    // Replace each styled declaration in-place with its wrapper function.
    // This preserves the original position of components in the file.
    for (const d of wrapperDecls) {
      const wrapperNodes = wrappedOrdered.filter((node: any) => {
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
    const hasReactBinding =
      root
        .find(j.ImportDeclaration)
        .filter((p: any) => (p.node?.source as any)?.value === "react")
        .filter((p: any) =>
          (p.node.specifiers ?? []).some(
            (s: any) =>
              (s.type === "ImportDefaultSpecifier" || s.type === "ImportNamespaceSpecifier") &&
              s.local?.type === "Identifier" &&
              s.local.name === "React",
          ),
        )
        .size() > 0;

    if (!hasReactBinding) {
      const firstImport = root.find(j.ImportDeclaration).at(0);
      const reactImport = j.importDeclaration(
        [j.importNamespaceSpecifier(j.identifier("React"))],
        j.literal("react"),
      ) as any;

      if (firstImport.size() > 0) {
        firstImport.insertBefore(reactImport);
      } else {
        root.get().node.program.body.unshift(reactImport);
      }
    }
  }
}

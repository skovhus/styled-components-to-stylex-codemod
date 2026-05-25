/**
 * Collects the public export surface for styled components before emit decisions.
 * Core concepts: named/default exports and dotted namespace/object exports.
 */
import type { JSCodeshift } from "jscodeshift";
import type { StyledDecl } from "../transform-types.js";
import type { ExportInfo } from "../transform-context.js";

export function collectExportedComponents(
  root: ReturnType<JSCodeshift>,
  j: JSCodeshift,
  declByLocal: Map<string, StyledDecl>,
): Map<string, ExportInfo> {
  const exportedComponents = new Map<string, ExportInfo>();

  // Named exports: export const Foo = styled.div`...` or export { Foo, Bar as Baz }
  root.find(j.ExportNamedDeclaration).forEach((p) => {
    const decl = p.node.declaration;
    if (decl?.type === "VariableDeclaration") {
      for (const d of decl.declarations) {
        if (d.type !== "VariableDeclarator") {
          continue;
        }
        const name = getIdentifierName(d.id);
        if (name && declByLocal.has(name)) {
          exportedComponents.set(name, {
            exportName: name,
            isDefault: false,
            isSpecifier: false,
          });
        }
      }
    }
    for (const spec of p.node.specifiers ?? []) {
      if (spec.type !== "ExportSpecifier") {
        continue;
      }
      const localName = getIdentifierName(spec.local);
      if (localName && declByLocal.has(localName)) {
        const exportName = getIdentifierName(spec.exported) ?? localName;
        exportedComponents.set(localName, {
          exportName,
          isDefault: false,
          isSpecifier: true,
        });
      }
    }
  });

  // Namespace exports (`export namespace Graph { export function Item() {} }`) and exported
  // object namespaces (`export const Section = { Container }`) are commonly consumed as
  // `<Graph.Item />` / `<Section.Container />`. Record the dotted export surface so
  // post-transform consumer patchers can update JSX attributes outside this file.
  collectDottedExportedComponents(root, j, declByLocal, exportedComponents);

  // Default exports: export default Foo
  root.find(j.ExportDefaultDeclaration).forEach((p) => {
    const name = getIdentifierName(p.node.declaration);
    if (name && declByLocal.has(name)) {
      exportedComponents.set(name, {
        exportName: "default",
        isDefault: true,
        isSpecifier: false,
      });
    }
  });

  return exportedComponents;
}

function collectDottedExportedComponents(
  root: ReturnType<JSCodeshift>,
  j: JSCodeshift,
  declByLocal: Map<string, StyledDecl>,
  exportedComponents: Map<string, ExportInfo>,
): void {
  const setDottedExport = (localName: string, exportName: string): void => {
    if (!declByLocal.has(localName)) {
      return;
    }
    const existing = exportedComponents.get(localName)?.exportName;
    if (existing && existing.split(".").length <= exportName.split(".").length) {
      return;
    }
    exportedComponents.set(localName, {
      exportName,
      isDefault: false,
      isSpecifier: false,
    });
  };

  const collectObjectProperties = (objectExpression: unknown, prefix: string): void => {
    const objectNode = objectExpression as
      | { type?: string; properties?: Array<{ type?: string; key?: unknown; value?: unknown }> }
      | null
      | undefined;
    if (objectNode?.type !== "ObjectExpression" || !Array.isArray(objectNode.properties)) {
      return;
    }
    for (const property of objectNode.properties) {
      if (property?.type !== "Property" && property?.type !== "ObjectProperty") {
        continue;
      }
      const keyName = getIdentifierName(property.key);
      if (!keyName) {
        continue;
      }
      const valueName = getIdentifierName(property.value);
      if (valueName) {
        setDottedExport(valueName, `${prefix}.${keyName}`);
        continue;
      }
      collectObjectProperties(property.value, `${prefix}.${keyName}`);
    }
  };

  root.find(j.ExportNamedDeclaration).forEach((p) => {
    const declaration = p.node.declaration;
    if (declaration?.type === "VariableDeclaration") {
      for (const declarator of declaration.declarations) {
        if (declarator.type !== "VariableDeclarator") {
          continue;
        }
        const exportName = getIdentifierName(declarator.id);
        if (exportName) {
          collectObjectProperties(declarator.init, exportName);
        }
      }
    }
    for (const specifier of p.node.specifiers ?? []) {
      if (specifier.type !== "ExportSpecifier") {
        continue;
      }
      const localName = getIdentifierName(specifier.local);
      const exportName = getIdentifierName(specifier.exported) ?? localName;
      if (localName && exportName) {
        collectObjectProperties(findVariableInitializer(root, j, localName), exportName);
      }
    }
  });

  const collectNamespaceExports = (node: unknown, namespacePath: string[]): void => {
    const current = node as
      | {
          type?: string;
          id?: unknown;
          body?: { type?: string; body?: unknown[] };
          declaration?: unknown;
        }
      | null
      | undefined;
    if (!current) {
      return;
    }
    if (current.type === "TSModuleDeclaration") {
      const namespaceName = getIdentifierName(current.id);
      if (!namespaceName) {
        return;
      }
      const nextPath = [...namespacePath, namespaceName];
      if (current.body?.type === "TSModuleBlock") {
        for (const statement of current.body.body ?? []) {
          collectNamespaceExports(statement, nextPath);
        }
      } else {
        collectNamespaceExports(current.body, nextPath);
      }
      return;
    }
    if (current.type !== "ExportNamedDeclaration") {
      return;
    }
    const declaration = current.declaration as {
      type?: string;
      id?: unknown;
      declarations?: unknown[];
    } | null;
    if (!declaration) {
      return;
    }
    if (declaration.type === "TSModuleDeclaration") {
      collectNamespaceExports(declaration, namespacePath);
      return;
    }
    if (declaration.type === "FunctionDeclaration") {
      const localName = getIdentifierName(declaration.id);
      if (localName) {
        setDottedExport(localName, [...namespacePath, localName].join("."));
      }
      return;
    }
    if (declaration.type === "VariableDeclaration" && Array.isArray(declaration.declarations)) {
      for (const declarator of declaration.declarations) {
        const localName = getIdentifierName((declarator as { id?: unknown }).id);
        if (localName) {
          setDottedExport(localName, [...namespacePath, localName].join("."));
        }
      }
    }
  };

  root.find(j.TSModuleDeclaration).forEach((p) => {
    collectNamespaceExports(p.node, []);
  });
}

function getIdentifierName(node: unknown): string | null {
  const n = node as { type?: string; name?: string } | null | undefined;
  return n?.type === "Identifier" && n.name ? n.name : null;
}

function findVariableInitializer(
  root: ReturnType<JSCodeshift>,
  j: JSCodeshift,
  localName: string,
): unknown {
  let init: unknown;
  root
    .find(j.VariableDeclarator, { id: { type: "Identifier", name: localName } } as any)
    .filter(isModuleScopeVariableDeclarator)
    .forEach((path) => {
      if (init !== undefined) {
        return;
      }
      init = path.node.init;
    });
  return init;
}

function isModuleScopeVariableDeclarator(path: { parentPath?: unknown }): boolean {
  let current = path.parentPath as { node?: { type?: string }; parentPath?: unknown } | undefined;
  while (current?.node) {
    const type = current.node.type;
    if (type === "Program" || type === "ExportNamedDeclaration") {
      return true;
    }
    if (
      type === "BlockStatement" ||
      type === "ForInStatement" ||
      type === "ForOfStatement" ||
      type === "ForStatement" ||
      type === "FunctionDeclaration" ||
      type === "FunctionExpression" ||
      type === "ArrowFunctionExpression"
    ) {
      return false;
    }
    current = current.parentPath as typeof current;
  }
  return false;
}

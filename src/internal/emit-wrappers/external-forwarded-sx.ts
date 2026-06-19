/**
 * Resolves whether an imported/external props type ultimately exposes a
 * forwarded `sx` prop (directly, via heritage, via re-exports, or via the
 * wrapped component's `ComponentProps`). Walks across module boundaries by
 * resolving and re-parsing source files on demand.
 */
import { existsSync, readFileSync } from "node:fs";
import type { ASTNode } from "jscodeshift";
import jscodeshift from "jscodeshift";
import { createModuleResolver } from "../prepass/resolve-imports.js";
import type { WrapperEmitter } from "./wrapper-emitter.js";
import {
  getHeritageTypeReferenceName,
  getModuleName,
  membersExposeProp,
  resolveTypeReferenceName,
  typeReferenceIsComponentPropsOfWrapped,
  type TypeReferenceName,
} from "./type-reference-names.js";

const moduleResolver = createModuleResolver();

export function importedPropsTypeExposesForwardedSx(args: {
  emitter: WrapperEmitter;
  typeName: string;
  wrappedComponent: string;
  seenTypeNames: Set<string>;
}): boolean {
  const { emitter, typeName, wrappedComponent, seenTypeNames } = args;
  const imported = findImportedType(emitter, typeName);
  return importedModuleTypeExposesForwardedSx({
    emitter,
    imported,
    referencedTypeName: imported?.importedName ?? "",
    wrappedComponent,
    seenTypeNames,
  });
}

export function importedNamespacePropsTypeExposesForwardedSx(args: {
  emitter: WrapperEmitter;
  typeName: Extract<TypeReferenceName, { kind: "qualified" }>;
  wrappedComponent: string;
  seenTypeNames: Set<string>;
}): boolean {
  const { emitter, typeName, wrappedComponent, seenTypeNames } = args;
  return importedModuleTypeExposesForwardedSx({
    emitter,
    imported: findNamespaceTypeImport(emitter, typeName.namespace),
    referencedTypeName: typeName.name,
    wrappedComponent,
    seenTypeNames,
  });
}

/**
 * Resolve an imported type's defining module, parse it, and check whether the
 * referenced type exposes a forwarded `sx`. Shared by the named-import and
 * namespace-import props-type checks. Returns false when the import cannot be
 * located, resolved, read, or parsed.
 */
function importedModuleTypeExposesForwardedSx(args: {
  emitter: WrapperEmitter;
  imported: { source: string } | null;
  referencedTypeName: string;
  wrappedComponent: string;
  seenTypeNames: Set<string>;
}): boolean {
  const { emitter, imported, referencedTypeName, wrappedComponent, seenTypeNames } = args;
  if (!imported) {
    return false;
  }
  const resolvedPath = moduleResolver.resolve(emitter.filePath, imported.source);
  if (!resolvedPath) {
    return false;
  }
  const source = readSourceWithExtensionFallback(resolvedPath);
  if (!source) {
    return false;
  }
  const parsed = parseTypeSource(source);
  if (!parsed) {
    return false;
  }
  return externalTypeReferenceExposesForwardedSx({
    j: parsed.j,
    root: parsed.root,
    filePath: resolvedPath,
    typeName: referencedTypeName,
    wrappedComponent,
    seenTypeNames,
  });
}

function externalTypeReferenceExposesForwardedSx(args: {
  j: typeof jscodeshift;
  root: ReturnType<typeof jscodeshift>;
  filePath: string;
  typeName: string;
  wrappedComponent: string;
  seenTypeNames: Set<string>;
}): boolean {
  const { j, root, filePath, typeName, wrappedComponent, seenTypeNames } = args;
  const visitedKey = `${filePath}\u0000${typeName}`;
  if (seenTypeNames.has(visitedKey)) {
    return false;
  }
  seenTypeNames.add(visitedKey);
  if (typeName === "default") {
    return externalDefaultExportedTypeExposesForwardedSx({
      j,
      root,
      filePath,
      wrappedComponent,
      seenTypeNames,
    });
  }
  const localType = findLocalTypeDeclaration({ j, root }, typeName);
  if (localType) {
    return externalPropsTypeExposesForwardedSx({
      j,
      root,
      filePath,
      propsType: localType,
      wrappedComponent,
      seenTypeNames,
    });
  }
  return externalExportedTypeExposesForwardedSx({
    j,
    root,
    filePath,
    typeName,
    wrappedComponent,
    seenTypeNames,
  });
}

function externalDefaultExportedTypeExposesForwardedSx(args: {
  j: typeof jscodeshift;
  root: ReturnType<typeof jscodeshift>;
  filePath: string;
  wrappedComponent: string;
  seenTypeNames: Set<string>;
}): boolean {
  const { j, root, filePath, wrappedComponent, seenTypeNames } = args;
  const body = root.get().node.program.body;
  for (const statement of body) {
    if (statement.type !== "ExportDefaultDeclaration") {
      if (statement.type !== "ExportNamedDeclaration") {
        continue;
      }
      const source = (statement.source as { value?: unknown } | null | undefined)?.value;
      if (typeof source === "string") {
        continue;
      }
      for (const specifier of statement.specifiers ?? []) {
        const spec = specifier as {
          type?: string;
          local?: { type?: string; name?: string; value?: unknown };
          exported?: { type?: string; name?: string; value?: unknown };
        };
        if (spec.type !== "ExportSpecifier" && spec.type !== "ExportTypeSpecifier") {
          continue;
        }
        if (getModuleName(spec.exported) !== "default") {
          continue;
        }
        const sourceName = getModuleName(spec.local);
        if (
          sourceName &&
          externalTypeReferenceExposesForwardedSx({
            j,
            root,
            filePath,
            typeName: sourceName,
            wrappedComponent,
            seenTypeNames,
          })
        ) {
          return true;
        }
      }
      continue;
    }
    const declaration = statement.declaration as
      | {
          type?: string;
          name?: string;
          body?: { body?: unknown[] };
          extends?: unknown[];
          typeAnnotation?: ASTNode;
        }
      | null
      | undefined;
    if (!declaration) {
      continue;
    }
    if (
      declaration.type === "TSInterfaceDeclaration" ||
      declaration.type === "TSTypeAliasDeclaration"
    ) {
      return externalPropsTypeExposesForwardedSx({
        j,
        root,
        filePath,
        propsType: declaration as ASTNode,
        wrappedComponent,
        seenTypeNames,
      });
    }
    if (declaration.type === "Identifier" && declaration.name) {
      return externalTypeReferenceExposesForwardedSx({
        j,
        root,
        filePath,
        typeName: declaration.name,
        wrappedComponent,
        seenTypeNames,
      });
    }
  }
  return false;
}

function externalPropsTypeExposesForwardedSx(args: {
  j: typeof jscodeshift;
  root: ReturnType<typeof jscodeshift>;
  filePath: string;
  propsType: ASTNode;
  wrappedComponent: string;
  seenTypeNames: Set<string>;
}): boolean {
  const { j, root, filePath, propsType, wrappedComponent, seenTypeNames } = args;
  const interfaceBody = (propsType as { body?: { body?: unknown[] }; members?: unknown[] }).body
    ?.body;
  if (
    membersExposeProp(interfaceBody, "sx") ||
    membersExposeProp((propsType as { members?: unknown[] }).members, "sx")
  ) {
    return true;
  }
  const interfaceExtends = (propsType as { extends?: unknown[] }).extends;
  if (
    externalInterfaceExtendsForwardedSx({
      j,
      root,
      filePath,
      interfaceExtends,
      wrappedComponent,
      seenTypeNames,
    })
  ) {
    return true;
  }
  if (typeReferenceIsComponentPropsOfWrapped(propsType, wrappedComponent)) {
    return true;
  }
  if (propsType.type === "TSIntersectionType") {
    for (const member of (propsType as { types?: ASTNode[] }).types ?? []) {
      if (
        externalPropsTypeExposesForwardedSx({
          j,
          root,
          filePath,
          propsType: member,
          wrappedComponent,
          seenTypeNames,
        })
      ) {
        return true;
      }
    }
    return false;
  }
  const typeRefName = resolveTypeReferenceName(propsType);
  if (!typeRefName) {
    return false;
  }
  return externalTypeReferenceNameExposesForwardedSx({
    j,
    root,
    filePath,
    typeName: typeRefName,
    wrappedComponent,
    seenTypeNames,
  });
}

function externalInterfaceExtendsForwardedSx(args: {
  j: typeof jscodeshift;
  root: ReturnType<typeof jscodeshift>;
  filePath: string;
  interfaceExtends: unknown[] | undefined;
  wrappedComponent: string;
  seenTypeNames: Set<string>;
}): boolean {
  const { j, root, filePath, interfaceExtends, wrappedComponent, seenTypeNames } = args;
  for (const heritage of interfaceExtends ?? []) {
    const typeName = getHeritageTypeReferenceName(heritage);
    if (
      typeName &&
      externalTypeReferenceNameExposesForwardedSx({
        j,
        root,
        filePath,
        typeName,
        wrappedComponent,
        seenTypeNames,
      })
    ) {
      return true;
    }
  }
  return false;
}

function externalTypeReferenceNameExposesForwardedSx(args: {
  j: typeof jscodeshift;
  root: ReturnType<typeof jscodeshift>;
  filePath: string;
  typeName: TypeReferenceName;
  wrappedComponent: string;
  seenTypeNames: Set<string>;
}): boolean {
  const { j, root, filePath, typeName, wrappedComponent, seenTypeNames } = args;
  if (typeName.kind === "identifier") {
    return externalTypeReferenceExposesForwardedSx({
      j,
      root,
      filePath,
      typeName: typeName.name,
      wrappedComponent,
      seenTypeNames,
    });
  }
  const imported = findNamespaceTypeImportInRoot(root, typeName.namespace);
  return imported
    ? externalSourceTypeExposesForwardedSx({
        fromPath: filePath,
        source: imported.source,
        typeName: typeName.name,
        wrappedComponent,
        seenTypeNames,
      })
    : false;
}

function externalExportedTypeExposesForwardedSx(args: {
  j: typeof jscodeshift;
  root: ReturnType<typeof jscodeshift>;
  filePath: string;
  typeName: string;
  wrappedComponent: string;
  seenTypeNames: Set<string>;
}): boolean {
  const { j, root, filePath, typeName, wrappedComponent, seenTypeNames } = args;
  const body = root.get().node.program.body;
  for (const statement of body) {
    if (statement.type === "ExportAllDeclaration") {
      const source = (statement.source as { value?: unknown } | null | undefined)?.value;
      if (
        typeof source === "string" &&
        externalSourceTypeExposesForwardedSx({
          fromPath: filePath,
          source,
          typeName,
          wrappedComponent,
          seenTypeNames,
        })
      ) {
        return true;
      }
      continue;
    }
    if (statement.type !== "ExportNamedDeclaration") {
      continue;
    }
    const source = (statement.source as { value?: unknown } | null | undefined)?.value;
    for (const specifier of statement.specifiers ?? []) {
      const spec = specifier as {
        type?: string;
        local?: { type?: string; name?: string; value?: unknown };
        exported?: { type?: string; name?: string; value?: unknown };
      };
      if (spec.type !== "ExportSpecifier" && spec.type !== "ExportTypeSpecifier") {
        continue;
      }
      const exportedName = getModuleName(spec.exported);
      if (exportedName !== typeName) {
        continue;
      }
      const sourceName = getModuleName(spec.local) ?? exportedName;
      if (typeof source !== "string") {
        if (
          externalTypeReferenceExposesForwardedSx({
            j,
            root,
            filePath,
            typeName: sourceName,
            wrappedComponent,
            seenTypeNames,
          })
        ) {
          return true;
        }
        continue;
      }
      if (
        externalSourceTypeExposesForwardedSx({
          fromPath: filePath,
          source,
          typeName: sourceName,
          wrappedComponent,
          seenTypeNames,
        })
      ) {
        return true;
      }
    }
  }
  return false;
}

function externalSourceTypeExposesForwardedSx(args: {
  fromPath: string;
  source: string;
  typeName: string;
  wrappedComponent: string;
  seenTypeNames: Set<string>;
}): boolean {
  const { fromPath, source, typeName, wrappedComponent, seenTypeNames } = args;
  const resolvedPath = moduleResolver.resolve(fromPath, source);
  if (!resolvedPath) {
    return false;
  }
  const sourceText = readSourceWithExtensionFallback(resolvedPath);
  if (!sourceText) {
    return false;
  }
  const parsed = parseTypeSource(sourceText);
  if (!parsed) {
    return false;
  }
  return externalTypeReferenceExposesForwardedSx({
    j: parsed.j,
    root: parsed.root,
    filePath: resolvedPath,
    typeName,
    wrappedComponent,
    seenTypeNames,
  });
}

function findImportedType(
  emitter: WrapperEmitter,
  localTypeName: string,
): { importedName: string; source: string } | null {
  const body = emitter.root.get().node.program.body;
  for (const statement of body) {
    if (statement.type !== "ImportDeclaration") {
      continue;
    }
    const source = (statement.source as { value?: unknown }).value;
    if (typeof source !== "string") {
      continue;
    }
    for (const specifier of statement.specifiers ?? []) {
      const spec = specifier as {
        type?: string;
        local?: { name?: string };
        imported?: { name?: string; value?: unknown };
      };
      if (spec.local?.name !== localTypeName || spec.type !== "ImportSpecifier") {
        if (spec.local?.name === localTypeName && spec.type === "ImportDefaultSpecifier") {
          return { importedName: "default", source };
        }
        continue;
      }
      const importedName =
        spec.imported?.name ??
        (typeof spec.imported?.value === "string" ? spec.imported.value : undefined);
      return importedName ? { importedName, source } : null;
    }
  }
  return null;
}

function findNamespaceTypeImport(
  emitter: WrapperEmitter,
  namespaceName: string,
): { source: string } | null {
  return findNamespaceTypeImportInRoot(emitter.root, namespaceName);
}

function findNamespaceTypeImportInRoot(
  root: ReturnType<typeof jscodeshift>,
  namespaceName: string,
): { source: string } | null {
  const body = root.get().node.program.body;
  for (const statement of body) {
    if (statement.type !== "ImportDeclaration") {
      continue;
    }
    const source = (statement.source as { value?: unknown }).value;
    if (typeof source !== "string") {
      continue;
    }
    for (const specifier of statement.specifiers ?? []) {
      const spec = specifier as {
        type?: string;
        local?: { name?: string };
      };
      if (spec.type === "ImportNamespaceSpecifier" && spec.local?.name === namespaceName) {
        return { source };
      }
    }
  }
  return null;
}

function findLocalTypeDeclaration(
  parsed: { j: typeof jscodeshift; root: ReturnType<typeof jscodeshift> },
  typeName: string,
): ASTNode | null {
  const alias = parsed.root.find(parsed.j.TSTypeAliasDeclaration).filter((p) => {
    const id = (p.node as { id?: { name?: string } }).id;
    return id?.name === typeName;
  });
  if (alias.size() > 0) {
    return (alias.get().node as { typeAnnotation?: ASTNode }).typeAnnotation ?? null;
  }
  const iface = parsed.root.find(parsed.j.TSInterfaceDeclaration).filter((p) => {
    const id = (p.node as { id?: { name?: string } }).id;
    return id?.name === typeName;
  });
  return iface.size() > 0 ? (iface.get().node as ASTNode) : null;
}

function parseTypeSource(
  source: string,
): { j: typeof jscodeshift; root: ReturnType<typeof jscodeshift> } | null {
  try {
    const j = jscodeshift.withParser("tsx");
    return { j, root: j(source) };
  } catch {
    return null;
  }
}

function readSourceWithExtensionFallback(absolutePath: string): string | null {
  for (const ext of ["", ".tsx", ".ts", ".jsx", ".js"]) {
    const candidate = `${absolutePath}${ext}`;
    if (!existsSync(candidate)) {
      continue;
    }
    try {
      return readFileSync(candidate, "utf8");
    } catch {
      return null;
    }
  }
  return null;
}

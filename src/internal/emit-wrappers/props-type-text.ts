/**
 * Constructs and mutates the props-type text for emitted wrapper components.
 * Handles Omit unions, transient-prop renames (including distributive Omit),
 * static-attr normalization, rendered-`as` resolution, and in-place renaming
 * or removal of members in existing local type declarations.
 */
import type { ASTNode } from "jscodeshift";
import jscodeshift from "jscodeshift";
import type { ExpressionKind } from "./types.js";
import type { WrapperEmitter } from "./wrapper-emitter.js";
import {
  getTypeReferenceParams,
  isPropsWithChildrenType,
  resolveTypeIdentifierName,
  typeKeyName,
} from "./type-reference-names.js";

export function buildOmitUnion(parts: string[]): string {
  return [...new Set(parts)].join(" | ");
}

/**
 * Builds the list of quoted prop keys (`"className"`, `"style"`, `"sx"`) that must be
 * omitted from a base element-props type because the wrapper does not allow them.
 */
export function buildOmittedStyleProps(args: {
  allowClassNameProp?: boolean;
  allowStyleProp?: boolean;
  allowSxProp?: boolean;
}): string[] {
  const omitted: string[] = [];
  if (!args.allowClassNameProp) {
    omitted.push('"className"');
  }
  if (!args.allowStyleProp) {
    omitted.push('"style"');
  }
  if (!args.allowSxProp) {
    omitted.push('"sx"');
  }
  return omitted;
}

export function transformExplicitPropsTypeText(args: {
  canMutateExplicitType: boolean;
  explicitAttrsOmitUnion: string | null;
  typeText: string;
  useDistributiveOmit: boolean;
  transientPropRenames: ReadonlyMap<string, string> | undefined;
}): string {
  const { canMutateExplicitType, explicitAttrsOmitUnion, typeText, useDistributiveOmit } = args;
  const omitKeys = [
    ...(explicitAttrsOmitUnion ? [explicitAttrsOmitUnion] : []),
    ...(!canMutateExplicitType && args.transientPropRenames
      ? [...args.transientPropRenames.keys()].map((key) => JSON.stringify(key))
      : []),
  ];
  const omitUnion = omitKeys.length > 0 ? buildOmitUnion(omitKeys) : null;
  const transientPropRenames =
    !canMutateExplicitType && args.transientPropRenames ? args.transientPropRenames : undefined;
  if (useDistributiveOmit && omitUnion) {
    return distributiveExplicitPropsTypeText({
      omitUnion,
      transientPropRenames,
      typeText,
    });
  }
  const base = omitUnion ? `Omit<${typeText}, ${omitUnion}>` : typeText;
  const renamedProps = buildRenamedTransientPropTypes(
    parenthesizeTypeForIndexedAccess(typeText),
    transientPropRenames,
  );
  return [base, ...renamedProps].join(" & ");
}

export function normalizeStaticForwardedAsAttr(
  staticAttrs: Record<string, unknown>,
  shouldLowerForwardedAs: boolean,
): Record<string, unknown> {
  if (shouldLowerForwardedAs || !Object.hasOwn(staticAttrs, "forwardedAs")) {
    return staticAttrs;
  }
  const { forwardedAs, ...restStaticAttrs } = staticAttrs;
  if (Object.hasOwn(restStaticAttrs, "as")) {
    return restStaticAttrs;
  }
  return { ...restStaticAttrs, as: forwardedAs };
}

export function omitStaticAttr(
  staticAttrs: Record<string, unknown>,
  key: string,
): Record<string, unknown> {
  const { [key]: _omit, ...rest } = staticAttrs;
  return rest;
}

export function staticSxAttrToExpression(
  j: typeof jscodeshift,
  value: unknown,
): ExpressionKind | null {
  if (value === undefined) {
    return null;
  }
  if (
    value &&
    typeof value === "object" &&
    typeof (value as { type?: unknown }).type === "string"
  ) {
    return value as ExpressionKind;
  }
  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean" ||
    value === null
  ) {
    return j.literal(value) as ExpressionKind;
  }
  return null;
}

export function resolveRenderedAsProp(args: {
  emitter: WrapperEmitter;
  propsType: ASTNode | null;
  fallbackTypeName?: string | null;
}): { propName: "as"; baseTypeText?: string; typeText: string } | null {
  const { emitter, fallbackTypeName, propsType } = args;
  if (!propsType) {
    return null;
  }
  const propOwnerType = findTypeOwningProp(emitter, propsType, "as");
  if (!propOwnerType) {
    return null;
  }
  const ownerTypeText = emitter.stringifyTsType(propOwnerType);
  const baseTypeText = fallbackTypeName ?? ownerTypeText;
  if (baseTypeText) {
    return {
      propName: "as",
      baseTypeText,
      typeText: `${ownerTypeText ?? baseTypeText}["as"]`,
    };
  }
  return {
    propName: "as",
    typeText: "React.ElementType",
  };
}

export function resolveTypeTextFromType(
  emitter: WrapperEmitter,
  type: ASTNode | null,
): string | null {
  if (!type) {
    return null;
  }
  return emitter.stringifyTsType(type);
}

export function renameTransientMembersInExistingType(
  emitter: WrapperEmitter,
  typeName: string,
  renames: ReadonlyMap<string, string> | undefined,
): void {
  if (!renames || renames.size === 0) {
    return;
  }
  const { root, j } = emitter;
  const renameKey = (key: unknown): void => {
    const keyNode = key as { type?: string; name?: string; value?: unknown };
    const current =
      keyNode.type === "Identifier"
        ? keyNode.name
        : typeof keyNode.value === "string"
          ? keyNode.value
          : undefined;
    const renamed = current ? renames.get(current) : undefined;
    if (!renamed) {
      return;
    }
    if (keyNode.type === "Identifier") {
      keyNode.name = renamed;
    } else {
      keyNode.value = renamed;
    }
  };
  const visit = (node: unknown): void => {
    if (!node || typeof node !== "object") {
      return;
    }
    const typedNode = node as { type?: string; key?: unknown };
    if (typedNode.type === "TSPropertySignature") {
      renameKey(typedNode.key);
    }
    for (const [field, child] of Object.entries(node)) {
      if (field === "loc" || field === "comments" || field === "parentPath") {
        continue;
      }
      if (Array.isArray(child)) {
        child.forEach(visit);
      } else if (child && typeof child === "object") {
        visit(child);
      }
    }
  };
  root
    .find(j.TSTypeAliasDeclaration, { id: { type: "Identifier", name: typeName } } as any)
    .forEach((path: any) => visit(path.node.typeAnnotation));
  root
    .find(j.TSInterfaceDeclaration, { id: { type: "Identifier", name: typeName } } as any)
    .forEach((path: any) => visit(path.node.body));
}

export function removeAttrsMembersInExistingType(
  emitter: WrapperEmitter,
  typeName: string,
  attrsProvidedPropNames: ReadonlySet<string>,
): boolean {
  if (attrsProvidedPropNames.size === 0) {
    return true;
  }
  const { root, j } = emitter;
  const removedNames = new Set<string>();
  const shouldRemoveMember = (member: unknown): boolean => {
    const typed = member as { type?: string; key?: unknown };
    if (typed.type !== "TSPropertySignature" && typed.type !== "TSMethodSignature") {
      return false;
    }
    const name = typeKeyName(typed.key);
    if (typeof name === "string" && attrsProvidedPropNames.has(name)) {
      removedNames.add(name);
      return true;
    }
    return false;
  };
  const visitType = (node: unknown): void => {
    if (!node || typeof node !== "object") {
      return;
    }
    const typed = node as { type?: string; members?: unknown[]; types?: unknown[] };
    if (typed.type === "TSTypeLiteral" && Array.isArray(typed.members)) {
      typed.members = typed.members.filter((member) => !shouldRemoveMember(member));
      return;
    }
    if (typed.type === "TSIntersectionType" && Array.isArray(typed.types)) {
      for (const part of typed.types) {
        visitType(part);
      }
      return;
    }
    if (typed.type === "TSUnionType" && Array.isArray(typed.types)) {
      for (const part of typed.types) {
        visitType(part);
      }
      return;
    }
    if (typed.type === "TSTypeReference") {
      for (const param of getTypeReferenceParams(node as ASTNode)) {
        visitType(param);
      }
    }
  };
  root
    .find(j.TSTypeAliasDeclaration, { id: { type: "Identifier", name: typeName } } as any)
    .forEach((path: any) => visitType(path.node.typeAnnotation));
  root
    .find(j.TSInterfaceDeclaration, { id: { type: "Identifier", name: typeName } } as any)
    .forEach((path: any) => {
      const body = path.node.body?.body;
      if (Array.isArray(body)) {
        path.node.body.body = body.filter((member: unknown) => !shouldRemoveMember(member));
      }
    });
  return [...attrsProvidedPropNames].every((name) => removedNames.has(name));
}

export function isTypeNameUsedOutsideOwner(
  emitter: WrapperEmitter,
  typeName: string,
  ownerLocalName: string,
): boolean {
  if (countTypeNameOccurrences(emitter.localSource, typeName) > 2) {
    return true;
  }
  const { root, j } = emitter;
  let usedElsewhere = false;
  root
    .find(j.TSTypeReference)
    .filter((path: any) => {
      const typeRefName = resolveTypeIdentifierName(path.node as ASTNode);
      return typeRefName === typeName;
    })
    .forEach((path: any) => {
      if (!isPathOwnedByLocalName(path, ownerLocalName)) {
        usedElsewhere = true;
      }
    });
  return usedElsewhere;
}

export function isIntrinsicPassthroughType(emitter: WrapperEmitter, type: ASTNode): boolean {
  const text = emitter.stringifyTsType(type);
  return text !== null && /^React\.ComponentProps(?:WithRef)?<"[^"]+">$/.test(text);
}

function distributiveExplicitPropsTypeText(args: {
  omitUnion: string;
  transientPropRenames: ReadonlyMap<string, string> | undefined;
  typeText: string;
}): string {
  const branchParts = [
    `Omit<T, ${args.omitUnion}>`,
    ...buildRenamedTransientPropTypes("T", args.transientPropRenames),
  ];
  return `((${args.typeText}) extends infer T ? T extends unknown ? ${branchParts.join(" & ")} : never : never)`;
}

function buildRenamedTransientPropTypes(
  sourceTypeText: string,
  transientPropRenames: ReadonlyMap<string, string> | undefined,
): string[] {
  return transientPropRenames
    ? [...transientPropRenames].map(
        ([original, renamed]) =>
          `{ [K in Extract<"${original}", keyof ${sourceTypeText}> as "${renamed}"]: ${sourceTypeText}[K] }`,
      )
    : [];
}

function parenthesizeTypeForIndexedAccess(typeText: string): string {
  return `(${typeText})`;
}

function findTypeOwningProp(
  emitter: WrapperEmitter,
  type: ASTNode,
  propName: string,
): ASTNode | null {
  if (type.type === "TSTypeLiteral") {
    const hasProp = ((type as { members?: unknown[] }).members ?? []).some((member) => {
      const typed = member as { type?: string; key?: { type?: string; name?: string } };
      return (
        typed.type === "TSPropertySignature" &&
        typed.key?.type === "Identifier" &&
        typed.key.name === propName
      );
    });
    return hasProp ? type : null;
  }
  if (type.type === "TSIntersectionType") {
    for (const memberType of (type as { types?: ASTNode[] }).types ?? []) {
      const found = findTypeOwningProp(emitter, memberType, propName);
      if (found) {
        return found;
      }
    }
    return null;
  }
  if (type.type === "TSTypeReference") {
    if (isPropsWithChildrenType(type)) {
      for (const param of (type as { typeParameters?: { params?: ASTNode[] } }).typeParameters
        ?.params ?? []) {
        if (findTypeOwningProp(emitter, param, propName)) {
          return type;
        }
      }
    }
    const typeName = resolveTypeIdentifierName(type);
    if (!typeName) {
      return null;
    }
    const typeAlias = emitter.root
      .find(emitter.j.TSTypeAliasDeclaration)
      .filter((p) => (p.node as { id?: { name?: string } }).id?.name === typeName);
    if (typeAlias.size() > 0) {
      const aliasType = typeAlias.get().node.typeAnnotation as ASTNode;
      return findTypeOwningProp(emitter, aliasType, propName) ? type : null;
    }
    const iface = emitter.root
      .find(emitter.j.TSInterfaceDeclaration)
      .filter((p) => (p.node as { id?: { name?: string } }).id?.name === typeName);
    if (iface.size() > 0) {
      const body = iface.get().node.body?.body ?? [];
      const hasProp = body.some((member: unknown) => {
        const typed = member as { type?: string; key?: { type?: string; name?: string } };
        return (
          typed.type === "TSPropertySignature" &&
          typed.key?.type === "Identifier" &&
          typed.key.name === propName
        );
      });
      return hasProp ? type : null;
    }
  }
  return null;
}

function countTypeNameOccurrences(source: string, typeName: string): number {
  const escapedTypeName = typeName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return source.match(new RegExp(`\\b${escapedTypeName}\\b`, "g"))?.length ?? 0;
}

function isPathOwnedByLocalName(path: { parentPath?: unknown }, ownerLocalName: string): boolean {
  let current = path.parentPath as { node?: unknown; parentPath?: unknown } | undefined;
  while (current) {
    const node = current.node as
      | {
          type?: string;
          id?: { type?: string; name?: string };
        }
      | undefined;
    if (
      node?.type === "VariableDeclarator" &&
      node.id?.type === "Identifier" &&
      node.id.name === ownerLocalName
    ) {
      return true;
    }
    if (node?.type === "FunctionDeclaration" && node.id?.name === ownerLocalName) {
      return true;
    }
    current = current.parentPath as typeof current;
  }
  return false;
}

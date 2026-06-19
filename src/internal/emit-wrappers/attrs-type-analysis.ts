/**
 * Analyzes whether a styled declaration's props type contains attrs-provided
 * props, may be a union, or is purely attrs-driven. Used to decide how to omit
 * attrs/transient props from explicit and local component prop types.
 */
import type { ASTNode } from "jscodeshift";
import type { StyledDecl } from "../transform-types.js";
import type { WrapperEmitter } from "./wrapper-emitter.js";
import {
  getUtilitySourceTypeParams,
  resolveTypeIdentifierName,
  typeKeyName,
} from "./type-reference-names.js";
import { buildOmitUnion } from "./props-type-text.js";

export function shouldKeepStylePropSeparate(componentName: string): boolean {
  return componentName.startsWith("motion.") || componentName.startsWith("animated.");
}

export function localOnlyComponentWrapperPropsTypeText(args: {
  d: StyledDecl;
  emitter: WrapperEmitter;
  allowClassNameProp: boolean;
  allowStyleProp: boolean;
  exposeSxProp: boolean;
  forceClassNameOptional: boolean;
  forceStyleOptional: boolean;
  functionParamTypeName: string | null;
  isPolymorphicComponentWrapper: boolean;
  shouldLowerForwardedAs: boolean;
}): string | null {
  const {
    d,
    emitter,
    allowClassNameProp,
    allowStyleProp,
    exposeSxProp,
    forceClassNameOptional,
    forceStyleOptional,
    functionParamTypeName,
    isPolymorphicComponentWrapper,
    shouldLowerForwardedAs,
  } = args;
  if (
    !emitter.emitTypes ||
    d.isExported ||
    emitter.exportedComponents.has(d.localName) ||
    d.propsType ||
    d.consumerUsesSpread ||
    emitter.isBroadValueUsage(d) ||
    functionParamTypeName ||
    isPolymorphicComponentWrapper ||
    allowClassNameProp ||
    allowStyleProp ||
    exposeSxProp ||
    forceClassNameOptional ||
    forceStyleOptional ||
    shouldLowerForwardedAs ||
    !hasStaticComponentAttrs(d) ||
    hasPropDrivenComponentWrapperBehavior(d) ||
    hasRuntimeAttrsProps(d)
  ) {
    return null;
  }

  const usedAttrs = emitter.getUsedAttrs(d.localName);
  if (usedAttrs.has("*") || [...usedAttrs].some((attr) => attr !== "children")) {
    return null;
  }
  if (!usedAttrs.has("children") && !emitter.hasJsxChildrenUsage(d.localName)) {
    return null;
  }
  return "{ children?: React.ReactNode }";
}

export function getExplicitAttrsOmitUnion(args: {
  emitter: WrapperEmitter;
  propsType: ASTNode | undefined;
  attrsProvidedPropNames: ReadonlySet<string>;
}): string | null {
  const { attrsProvidedPropNames, emitter, propsType } = args;
  if (!propsType || attrsProvidedPropNames.size === 0) {
    return null;
  }
  return explicitTypeMayContainAttrs(emitter, propsType, attrsProvidedPropNames)
    ? buildOmitUnion([...attrsProvidedPropNames].map((name) => JSON.stringify(name)))
    : null;
}

export function getExplicitTransientPropRenames(args: {
  emitter: WrapperEmitter;
  propsType: ASTNode | undefined;
  transientPropRenames: ReadonlyMap<string, string> | undefined;
}): ReadonlyMap<string, string> | undefined {
  const { emitter, propsType, transientPropRenames } = args;
  if (!propsType || !transientPropRenames || transientPropRenames.size === 0) {
    return undefined;
  }
  const narrowed = new Map<string, string>();
  for (const [original, renamed] of transientPropRenames) {
    if (explicitTypeMayContainAttrs(emitter, propsType, new Set([original]))) {
      narrowed.set(original, renamed);
    }
  }
  return narrowed.size > 0 ? narrowed : undefined;
}

export function explicitTypeMayBeUnion(
  emitter: WrapperEmitter,
  propsType: ASTNode,
  visitedTypeNames = new Set<string>(),
): boolean {
  if (propsType.type === "TSUnionType") {
    return true;
  }
  if (propsType.type === "TSIntersectionType") {
    return ((propsType as { types?: ASTNode[] }).types ?? []).some((part) =>
      explicitTypeMayBeUnion(emitter, part, new Set(visitedTypeNames)),
    );
  }
  if (propsType.type === "TSParenthesizedType") {
    const inner = (propsType as { typeAnnotation?: ASTNode }).typeAnnotation;
    return inner ? explicitTypeMayBeUnion(emitter, inner, visitedTypeNames) : false;
  }
  if (propsType.type !== "TSTypeReference") {
    return false;
  }
  const utilitySourceTypes = getUtilitySourceTypeParams(propsType);
  if (utilitySourceTypes) {
    return utilitySourceTypes.some((param) =>
      explicitTypeMayBeUnion(emitter, param, new Set(visitedTypeNames)),
    );
  }
  const typeName = resolveTypeIdentifierName(propsType);
  if (!typeName || !emitter.typeExistsInFile(typeName) || visitedTypeNames.has(typeName)) {
    return false;
  }
  visitedTypeNames.add(typeName);
  let mayBeUnion = false;
  const { root, j } = emitter;
  root
    .find(j.TSTypeAliasDeclaration, { id: { type: "Identifier", name: typeName } } as any)
    .forEach((path: any) => {
      if (explicitTypeMayBeUnion(emitter, path.node.typeAnnotation as ASTNode, visitedTypeNames)) {
        mayBeUnion = true;
      }
    });
  return mayBeUnion;
}

function hasStaticComponentAttrs(d: StyledDecl): boolean {
  return Object.keys(d.attrsInfo?.staticAttrs ?? {}).length > 0;
}

function hasRuntimeAttrsProps(d: StyledDecl): boolean {
  const attrsInfo = d.attrsInfo;
  return !!(
    (attrsInfo?.defaultAttrs?.length ?? 0) > 0 ||
    (attrsInfo?.dynamicAttrs?.length ?? 0) > 0 ||
    (attrsInfo?.conditionalAttrs?.length ?? 0) > 0 ||
    (attrsInfo?.invertedBoolAttrs?.length ?? 0) > 0 ||
    (attrsInfo?.attrsDynamicStyles?.length ?? 0) > 0 ||
    attrsInfo?.attrsStaticStyleExpr
  );
}

function hasPropDrivenComponentWrapperBehavior(d: StyledDecl): boolean {
  return !!(
    d.enumVariant ||
    d.shouldForwardProp ||
    (d.inlineStyleProps?.length ?? 0) > 0 ||
    (d.styleFnFromProps?.length ?? 0) > 0 ||
    (d.variantDimensions?.length ?? 0) > 0 ||
    (d.compoundVariants?.length ?? 0) > 0 ||
    Object.keys(d.variantStyleKeys ?? {}).length > 0 ||
    (d.transientPropRenames?.size ?? 0) > 0 ||
    (d.observedExpressionConditionDropProps?.size ?? 0) > 0 ||
    (d.styleValueVariantProps?.size ?? 0) > 0
  );
}

function explicitTypeMayContainAttrs(
  emitter: WrapperEmitter,
  propsType: ASTNode,
  attrsProvidedPropNames: ReadonlySet<string>,
  visitedTypeNames = new Set<string>(),
): boolean {
  if (propsType.type === "TSIntersectionType" || propsType.type === "TSUnionType") {
    return ((propsType as { types?: ASTNode[] }).types ?? []).some((part) =>
      explicitTypeMayContainAttrs(emitter, part, attrsProvidedPropNames, new Set(visitedTypeNames)),
    );
  }
  if (propsType.type === "TSParenthesizedType") {
    const inner = (propsType as { typeAnnotation?: ASTNode }).typeAnnotation;
    return inner
      ? explicitTypeMayContainAttrs(emitter, inner, attrsProvidedPropNames, visitedTypeNames)
      : false;
  }
  if (propsType.type === "TSTypeLiteral") {
    return typeLiteralHasAttrs(propsType, attrsProvidedPropNames);
  }
  if (propsType.type !== "TSTypeReference") {
    return false;
  }
  const utilitySourceTypes = getUtilitySourceTypeParams(propsType);
  if (utilitySourceTypes) {
    return utilitySourceTypes.some((param) =>
      explicitTypeMayContainAttrs(
        emitter,
        param,
        attrsProvidedPropNames,
        new Set(visitedTypeNames),
      ),
    );
  }
  const typeName = resolveTypeIdentifierName(propsType);
  if (!typeName) {
    return true;
  }
  if (!emitter.typeExistsInFile(typeName)) {
    return true;
  }
  if (visitedTypeNames.has(typeName)) {
    return false;
  }
  visitedTypeNames.add(typeName);
  return localTypeMayContainAttrs(emitter, typeName, attrsProvidedPropNames, visitedTypeNames);
}

function localTypeMayContainAttrs(
  emitter: WrapperEmitter,
  typeName: string,
  attrsProvidedPropNames: ReadonlySet<string>,
  visitedTypeNames: ReadonlySet<string>,
): boolean {
  const { root, j } = emitter;
  let mayContainAttrs = false;
  root
    .find(j.TSInterfaceDeclaration, { id: { type: "Identifier", name: typeName } } as any)
    .forEach((path: any) => {
      const members = path.node.body?.body ?? [];
      if (members.some((member: unknown) => typeMemberHasAttrs(member, attrsProvidedPropNames))) {
        mayContainAttrs = true;
      }
      for (const heritage of path.node.extends ?? []) {
        const heritageTypeName = resolveHeritageIdentifierName(heritage);
        if (!heritageTypeName || !emitter.typeExistsInFile(heritageTypeName)) {
          mayContainAttrs = true;
          return;
        }
        if (
          !visitedTypeNames.has(heritageTypeName) &&
          localTypeMayContainAttrs(
            emitter,
            heritageTypeName,
            attrsProvidedPropNames,
            new Set([...visitedTypeNames, heritageTypeName]),
          )
        ) {
          mayContainAttrs = true;
        }
      }
    });
  root
    .find(j.TSTypeAliasDeclaration, { id: { type: "Identifier", name: typeName } } as any)
    .forEach((path: any) => {
      if (
        explicitTypeMayContainAttrs(
          emitter,
          path.node.typeAnnotation as ASTNode,
          attrsProvidedPropNames,
          new Set(visitedTypeNames),
        )
      ) {
        mayContainAttrs = true;
      }
    });
  return mayContainAttrs;
}

function typeLiteralHasAttrs(
  typeLiteral: ASTNode,
  attrsProvidedPropNames: ReadonlySet<string>,
): boolean {
  return ((typeLiteral as { members?: unknown[] }).members ?? []).some((member) =>
    typeMemberHasAttrs(member, attrsProvidedPropNames),
  );
}

function typeMemberHasAttrs(member: unknown, attrsProvidedPropNames: ReadonlySet<string>): boolean {
  const typed = member as { type?: string; key?: unknown };
  if (typed.type !== "TSPropertySignature" && typed.type !== "TSMethodSignature") {
    return false;
  }
  const name = typeKeyName(typed.key);
  return typeof name === "string" && attrsProvidedPropNames.has(name);
}

function resolveHeritageIdentifierName(heritage: unknown): string | null {
  const typed = heritage as {
    expression?: { type?: string; name?: string };
  };
  return typed.expression?.type === "Identifier" ? (typed.expression.name ?? null) : null;
}

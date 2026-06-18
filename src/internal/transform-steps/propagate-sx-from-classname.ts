/**
 * Step: add sx pass-through props for local wrappers that forward className.
 * Core concepts: typed wrapper props and converted child component forwarding.
 */
import type { ASTNode, ASTPath, JSCodeshift } from "jscodeshift";
import { CONTINUE, type StepResult, type StyledDecl } from "../transform-types.js";
import type { TransformContext } from "../transform-context.js";
import { isReactComponentPropsUtilityName } from "../utilities/jscodeshift-utils.js";

/**
 * Adds an `sx` prop to typed wrapper components that pass their `className`
 * prop through to converted styled-component wrappers.
 */
export function propagateSxFromClassNameStep(ctx: TransformContext): StepResult {
  const convertedWrappers = collectConvertedWrappers(ctx);
  if (convertedWrappers.names.size === 0) {
    return CONTINUE;
  }
  const stylexStyleImports = collectStylexStyleImports(ctx);

  const components = collectComponentCandidates(ctx);
  for (const component of components) {
    if (convertedWrappers.names.has(component.name)) {
      continue;
    }

    const propsBinding = getPropsBinding(component.fn);
    if (!propsBinding) {
      continue;
    }

    const propsType = getPropsType(
      ctx,
      propsBinding.typeName,
      component.fnPath,
      convertedWrappers.names,
      stylexStyleImports,
    );
    if (!propsType) {
      continue;
    }

    const classNameMember =
      propsType.kind === "mutable" ? getPropsTypeMember(propsType.members, "className") : null;
    const sxMember =
      propsType.kind === "mutable" ? getPropsTypeMember(propsType.members, "sx") : null;
    const propsTypeAlreadyHasSx =
      propsType.kind === "mutable" ? Boolean(sxMember) : propsType.hasSx;
    const propsTypeHasCompatibleSx =
      propsType.kind === "mutable"
        ? !sxMember || isStylexSxMember(sxMember, stylexStyleImports)
        : propsType.hasSx;
    const propsTypeHasClassName =
      propsType.kind === "mutable" ? Boolean(classNameMember) : propsType.hasClassName;
    if (!propsTypeHasClassName || !propsTypeHasCompatibleSx) {
      continue;
    }

    const sxExpression = buildSxExpression(ctx.j, propsBinding);
    const changedJsx = addSxToForwardedChildren({
      ctx,
      fn: component.fn,
      fnPath: component.fnPath,
      convertedWrapperBindings: convertedWrappers.bindings,
      propsBinding,
      sxExpression,
    });
    if (!changedJsx) {
      continue;
    }

    if (propsType.kind === "mutable" && classNameMember && !propsTypeAlreadyHasSx) {
      addSxMemberAfterClassName({
        j: ctx.j,
        propsType,
        classNameMember,
      });
    }
    addSxDestructure(ctx, propsBinding);
    ctx.markChanged();
  }

  return CONTINUE;
}

type FunctionLike = {
  params?: unknown[];
  body?: unknown;
};

type ComponentCandidate = {
  name: string;
  fn: FunctionLike;
  fnPath: ScopedAstPath;
};

type JsxExpression = Parameters<JSCodeshift["jsxExpressionContainer"]>[0];

type ConvertedWrappers = {
  names: Set<string>;
  bindings: Map<string, ScopedAstPath>;
};

type ScopedAstPath = ASTPath<any> & {
  scope?: {
    isGlobal?: boolean;
    lookup?: (name: string) => object | null | undefined;
  };
  parentPath?: ScopedAstPath;
};

type PropsBinding =
  | {
      kind: "destructured";
      pattern: any;
      typeName: string;
      classNameLocal: string;
      sxLocal: string;
      restLocal: string | null;
    }
  | {
      kind: "propsObject";
      propsLocal: string;
      typeName: string;
    };

type MutablePropsType = {
  kind: "mutable";
  members: any[];
  replaceMembers: (members: any[]) => void;
};

type ReadonlyPropsType = {
  kind: "readonly";
  hasClassName: boolean;
  hasSx: boolean;
};

type PropsType = MutablePropsType | ReadonlyPropsType;

type SxSurface = "missing" | "stylex" | "nonStylex";

type PropsSurface = {
  hasClassName: boolean;
  sx: SxSurface;
};

type StylexStyleImports = {
  namespaceNames: Set<string>;
  styleTypeNames: Set<string>;
};

function collectConvertedWrappers(ctx: TransformContext): ConvertedWrappers {
  const names = new Set<string>();
  const styledDecls = ctx.styledDecls as StyledDecl[] | undefined;
  for (const decl of styledDecls ?? []) {
    if (decl.needsWrapperComponent && !decl.isCssHelper && !decl.skipTransform) {
      names.add(decl.localName);
    }
  }

  return {
    names,
    bindings: collectTopLevelBindingPaths(ctx, names),
  };
}

function collectStylexStyleImports(ctx: TransformContext): StylexStyleImports {
  const namespaceNames = new Set<string>();
  const styleTypeNames = new Set<string>();
  ctx.root
    .find(ctx.j.ImportDeclaration, { source: { value: "@stylexjs/stylex" } } as any)
    .forEach((path: any) => {
      for (const specifier of path.node.specifiers ?? []) {
        if (specifier.type === "ImportNamespaceSpecifier" && specifier.local?.name) {
          namespaceNames.add(specifier.local.name);
        } else if (
          specifier.type === "ImportSpecifier" &&
          specifier.imported?.type === "Identifier" &&
          specifier.imported.name === "StyleXStyles" &&
          specifier.local?.name
        ) {
          styleTypeNames.add(specifier.local.name);
        }
      }
    });
  return { namespaceNames, styleTypeNames };
}

function collectTopLevelBindingPaths(
  ctx: TransformContext,
  names: Set<string>,
): Map<string, ScopedAstPath> {
  const bindings = new Map<string, ScopedAstPath>();
  const { root, j } = ctx;

  root.find(j.FunctionDeclaration).forEach((path: ScopedAstPath) => {
    const name = path.node.id?.name;
    if (!name || !names.has(name) || !isTopLevelValueBindingPath(path)) {
      return;
    }
    bindings.set(name, path);
  });

  root.find(j.VariableDeclarator).forEach((path: ScopedAstPath) => {
    const name = path.node.id?.type === "Identifier" ? path.node.id.name : undefined;
    if (!name || !names.has(name) || !isTopLevelValueBindingPath(path)) {
      return;
    }
    bindings.set(name, path);
  });

  return bindings;
}

function collectComponentCandidates(ctx: TransformContext): ComponentCandidate[] {
  const candidates: ComponentCandidate[] = [];
  const { root, j } = ctx;

  root.find(j.FunctionDeclaration).forEach((path: ScopedAstPath) => {
    const name = path.node.id?.name;
    if (name) {
      candidates.push({ name, fn: path.node, fnPath: path });
    }
  });

  root.find(j.VariableDeclarator).forEach((path: any) => {
    const name = path.node.id?.type === "Identifier" ? path.node.id.name : undefined;
    const init = path.node.init;
    if (
      name &&
      init &&
      (init.type === "ArrowFunctionExpression" || init.type === "FunctionExpression")
    ) {
      candidates.push({ name, fn: init, fnPath: path.get("init") as ScopedAstPath });
    }
  });

  return candidates;
}

function getPropsBinding(fn: FunctionLike): PropsBinding | null {
  const firstParam = fn.params?.[0] as any;
  if (!firstParam) {
    return null;
  }

  const typeName = getTypeReferenceName(firstParam.typeAnnotation?.typeAnnotation);
  if (!typeName) {
    return null;
  }

  if (firstParam.type === "ObjectPattern") {
    const classNameProp = (firstParam.properties ?? []).find(
      (prop: any) => getObjectPatternKeyName(prop) === "className",
    );
    const classNameLocal = getObjectPatternValueName(classNameProp);
    if (!classNameLocal) {
      return null;
    }
    const hasSx = hasObjectPatternProp(firstParam, "sx");
    return {
      kind: "destructured",
      pattern: firstParam,
      typeName,
      classNameLocal,
      sxLocal: hasSx ? getExistingSxLocal(firstParam) : getAvailableSxLocalName(fn),
      restLocal: hasSx ? null : getObjectPatternRestLocal(firstParam),
    };
  }

  if (firstParam.type === "Identifier") {
    return {
      kind: "propsObject",
      propsLocal: firstParam.name,
      typeName,
    };
  }
  return null;
}

function getTypeReferenceName(typeAnnotation: any): string | null {
  if (
    typeAnnotation?.type === "TSTypeReference" &&
    typeAnnotation.typeName?.type === "Identifier"
  ) {
    return typeAnnotation.typeName.name;
  }
  return null;
}

function getPropsType(
  ctx: TransformContext,
  typeName: string,
  referencePath: ScopedAstPath,
  convertedWrapperNames: Set<string>,
  stylexStyleImports: StylexStyleImports,
): PropsType | null {
  if (isTypeParameterInScope(referencePath, typeName)) {
    return null;
  }

  const { root, j } = ctx;

  let bestPath: ScopedAstPath | null | undefined;
  let bestDepth = -1;
  const considerTypePath = (path: ScopedAstPath): void => {
    const containerPath = getLexicalContainerPath(path);
    if (!containerPath || !pathContains(containerPath, referencePath)) {
      return;
    }
    const depth = pathDepth(containerPath);
    if (depth > bestDepth) {
      bestPath = path;
      bestDepth = depth;
    }
  };

  const interfaces = root.find(j.TSInterfaceDeclaration, {
    id: { type: "Identifier", name: typeName },
  } as any);
  interfaces.forEach((path: ScopedAstPath) => {
    considerTypePath(path);
  });

  const aliases = root.find(j.TSTypeAliasDeclaration, {
    id: { type: "Identifier", name: typeName },
  } as any);
  aliases.forEach((path: ScopedAstPath) => {
    considerTypePath(path);
  });

  const matched = bestPath?.node as any;
  if (!matched) {
    return null;
  }
  if (matched.type === "TSInterfaceDeclaration") {
    return {
      kind: "mutable",
      members: matched.body?.body ?? [],
      replaceMembers(members) {
        matched.body.body = members;
      },
    };
  }
  if (matched.type !== "TSTypeAliasDeclaration") {
    return null;
  }
  if (matched.typeAnnotation?.type !== "TSTypeLiteral") {
    return getReadonlyAliasPropsType(
      matched.typeAnnotation,
      convertedWrapperNames,
      stylexStyleImports,
    );
  }
  return {
    kind: "mutable",
    members: matched.typeAnnotation.members ?? [],
    replaceMembers(members) {
      matched.typeAnnotation.members = members;
    },
  };
}

function getReadonlyAliasPropsType(
  typeAnnotation: any,
  convertedWrapperNames: Set<string>,
  stylexStyleImports: StylexStyleImports,
): ReadonlyPropsType | null {
  const surface = getPropsSurface(typeAnnotation, convertedWrapperNames, stylexStyleImports);
  if (!surface?.hasClassName || surface.sx !== "stylex") {
    return null;
  }
  return {
    kind: "readonly",
    hasClassName: true,
    hasSx: true,
  };
}

function getPropsSurface(
  typeAnnotation: any,
  convertedWrapperNames: Set<string>,
  stylexStyleImports: StylexStyleImports,
): PropsSurface | null {
  if (!typeAnnotation) {
    return null;
  }

  if (isComponentPropsOfConvertedWrapper(typeAnnotation, convertedWrapperNames)) {
    return { hasClassName: true, sx: "stylex" };
  }

  if (typeAnnotation.type === "TSIntersectionType") {
    let hasSurface = false;
    let hasClassName = false;
    let sx: SxSurface = "missing";
    for (const part of typeAnnotation.types ?? []) {
      const partSurface = getPropsSurface(part, convertedWrapperNames, stylexStyleImports);
      if (!partSurface) {
        continue;
      }
      hasSurface = true;
      hasClassName ||= partSurface.hasClassName;
      sx = mergeSxSurfaces(sx, partSurface.sx);
    }
    return hasSurface ? { hasClassName, sx } : null;
  }

  if (typeAnnotation.type === "TSParenthesizedType") {
    return getPropsSurface(
      typeAnnotation.typeAnnotation,
      convertedWrapperNames,
      stylexStyleImports,
    );
  }

  if (typeAnnotation.type === "TSTypeLiteral") {
    const members = typeAnnotation.members ?? [];
    const sxMember = getPropsTypeMember(members, "sx");
    return {
      hasClassName: propsTypeHasProp(members, "className"),
      sx: sxMember ? getSxMemberSurface(sxMember, stylexStyleImports) : "missing",
    };
  }

  if (isOmitTypeReference(typeAnnotation)) {
    const params = getTypeReferenceParams(typeAnnotation);
    const sourceSurface = getPropsSurface(params[0], convertedWrapperNames, stylexStyleImports);
    const omittedProps = getStringLiteralTypeNames(params[1]);
    if (!sourceSurface || !omittedProps) {
      return null;
    }
    return {
      hasClassName: sourceSurface.hasClassName && !omittedProps.has("className"),
      sx: omittedProps.has("sx") ? "missing" : sourceSurface.sx,
    };
  }

  if (isPickTypeReference(typeAnnotation)) {
    const params = getTypeReferenceParams(typeAnnotation);
    const sourceSurface = getPropsSurface(params[0], convertedWrapperNames, stylexStyleImports);
    const pickedProps = getStringLiteralTypeNames(params[1]);
    if (!sourceSurface || !pickedProps) {
      return null;
    }
    return {
      hasClassName: sourceSurface.hasClassName && pickedProps.has("className"),
      sx: pickedProps.has("sx") ? sourceSurface.sx : "missing",
    };
  }

  return null;
}

function mergeSxSurfaces(left: SxSurface, right: SxSurface): SxSurface {
  if (left === "nonStylex" || right === "nonStylex") {
    return "nonStylex";
  }
  if (left === "stylex" || right === "stylex") {
    return "stylex";
  }
  return "missing";
}

function isComponentPropsOfConvertedWrapper(
  typeAnnotation: any,
  convertedWrapperNames: Set<string>,
): boolean {
  if (typeAnnotation?.type !== "TSTypeReference" || !isComponentPropsTypeName(typeAnnotation)) {
    return false;
  }
  return getTypeReferenceParams(typeAnnotation).some((param) => {
    if (param?.type !== "TSTypeQuery") {
      return false;
    }
    const componentName = getTypeQueryExpressionName(param.exprName);
    return componentName ? convertedWrapperNames.has(componentName) : false;
  });
}

function isComponentPropsTypeName(typeReference: any): boolean {
  const typeName = typeReference.typeName;
  if (typeName?.type === "Identifier") {
    return isReactComponentPropsUtilityName(typeName.name);
  }
  return (
    typeName?.type === "TSQualifiedName" &&
    typeName.left?.type === "Identifier" &&
    typeName.left.name === "React" &&
    typeName.right?.type === "Identifier" &&
    isReactComponentPropsUtilityName(typeName.right.name)
  );
}

function isOmitTypeReference(typeAnnotation: any): boolean {
  return isUtilityTypeReference(typeAnnotation, "Omit");
}

function isPickTypeReference(typeAnnotation: any): boolean {
  return isUtilityTypeReference(typeAnnotation, "Pick");
}

function isUtilityTypeReference(typeAnnotation: any, name: string): boolean {
  return (
    typeAnnotation?.type === "TSTypeReference" &&
    typeAnnotation.typeName?.type === "Identifier" &&
    typeAnnotation.typeName.name === name
  );
}

function getTypeReferenceParams(typeReference: any): any[] {
  return typeReference.typeParameters?.params ?? typeReference.typeArguments?.params ?? [];
}

function getTypeQueryExpressionName(exprName: any): string | null {
  if (exprName?.type === "Identifier") {
    return exprName.name;
  }
  return null;
}

function getStringLiteralTypeNames(typeAnnotation: any): Set<string> | null {
  if (!typeAnnotation) {
    return null;
  }
  if (typeAnnotation.type === "TSLiteralType") {
    const value = typeAnnotation.literal?.value;
    return typeof value === "string" ? new Set([value]) : null;
  }
  if (typeAnnotation.type === "TSUnionType") {
    const names = new Set<string>();
    for (const part of typeAnnotation.types ?? []) {
      const partNames = getStringLiteralTypeNames(part);
      if (!partNames) {
        return null;
      }
      for (const name of partNames) {
        names.add(name);
      }
    }
    return names;
  }
  return null;
}

function getLexicalContainerPath(path: ScopedAstPath): ScopedAstPath | null {
  let current = path.parentPath;
  while (current) {
    if (
      current.node?.type === "Program" ||
      current.node?.type === "BlockStatement" ||
      current.node?.type === "TSModuleBlock"
    ) {
      return current;
    }
    current = current.parentPath;
  }
  return null;
}

function isTypeParameterInScope(referencePath: ScopedAstPath, typeName: string): boolean {
  let current: ScopedAstPath | undefined = referencePath;
  while (current) {
    if (hasTypeParameterNamed(current.node, typeName)) {
      return true;
    }
    current = current.parentPath;
  }
  return false;
}

function hasTypeParameterNamed(node: unknown, typeName: string): boolean {
  if (!node || typeof node !== "object") {
    return false;
  }
  const params = (node as { typeParameters?: { params?: unknown[] } }).typeParameters?.params;
  return (params ?? []).some((param) => getTypeParameterName(param) === typeName);
}

function getTypeParameterName(param: unknown): string | null {
  if (!param || typeof param !== "object") {
    return null;
  }
  const node = param as { name?: unknown; id?: { name?: unknown } };
  if (typeof node.name === "string") {
    return node.name;
  }
  return typeof node.id?.name === "string" ? node.id.name : null;
}

function pathContains(containerPath: ScopedAstPath, descendantPath: ScopedAstPath): boolean {
  let current: ScopedAstPath | undefined = descendantPath;
  while (current) {
    if (current.node === containerPath.node) {
      return true;
    }
    current = current.parentPath;
  }
  return false;
}

function pathDepth(path: ScopedAstPath): number {
  let depth = 0;
  let current = path.parentPath;
  while (current) {
    depth++;
    current = current.parentPath;
  }
  return depth;
}

function propsTypeHasProp(members: any[], propName: string): boolean {
  return members.some((member) => getMemberName(member) === propName);
}

function getPropsTypeMember(members: any[], propName: string): Record<string, unknown> | null {
  return members.find((member) => getMemberName(member) === propName) ?? null;
}

function getMemberName(member: any): string | null {
  const key = member?.key;
  if (!key) {
    return null;
  }
  if (key.type === "Identifier") {
    return key.name;
  }
  if (key.type === "StringLiteral" || key.type === "Literal") {
    return typeof key.value === "string" ? key.value : null;
  }
  return null;
}

function getSxMemberSurface(member: any, stylexStyleImports: StylexStyleImports): SxSurface {
  return isStylexSxMember(member, stylexStyleImports) ? "stylex" : "nonStylex";
}

function isStylexSxMember(member: any, stylexStyleImports: StylexStyleImports): boolean {
  return isStylexStylesType(member?.typeAnnotation?.typeAnnotation, stylexStyleImports);
}

function isStylexStylesType(typeAnnotation: any, stylexStyleImports: StylexStyleImports): boolean {
  if (!typeAnnotation) {
    return false;
  }
  if (typeAnnotation.type === "TSParenthesizedType") {
    return isStylexStylesType(typeAnnotation.typeAnnotation, stylexStyleImports);
  }
  if (typeAnnotation.type !== "TSTypeReference") {
    return false;
  }
  const typeName = typeAnnotation.typeName;
  if (typeName?.type === "Identifier") {
    return stylexStyleImports.styleTypeNames.has(typeName.name);
  }
  return (
    typeName?.type === "TSQualifiedName" &&
    typeName.left?.type === "Identifier" &&
    stylexStyleImports.namespaceNames.has(typeName.left.name) &&
    typeName.right?.type === "Identifier" &&
    typeName.right.name === "StyleXStyles"
  );
}

function addSxMemberAfterClassName(args: {
  j: JSCodeshift;
  propsType: { members: any[]; replaceMembers: (members: any[]) => void };
  classNameMember: any;
}): void {
  const { j, propsType, classNameMember } = args;
  const sxMember = createSxMember(j, classNameMember.comments);
  const nextMembers: any[] = [];
  for (const member of propsType.members) {
    nextMembers.push(member);
    if (member === classNameMember) {
      nextMembers.push(sxMember);
    }
  }
  propsType.replaceMembers(nextMembers);
}

function createSxMember(j: JSCodeshift, sourceComments: any[] | undefined): any {
  const parsed = j("type _Props = { sx?: stylex.StyleXStyles }")
    .find(j.TSPropertySignature)
    .nodes()[0] as any;
  parsed.comments = cloneSxComments(sourceComments);
  return parsed;
}

function cloneSxComments(sourceComments: any[] | undefined): any[] | undefined {
  if (!sourceComments || sourceComments.length === 0) {
    return undefined;
  }
  return sourceComments.map((comment) => ({
    ...comment,
    value: rewriteClassNameComment(comment.value),
  }));
}

function rewriteClassNameComment(value: unknown): unknown {
  if (typeof value !== "string") {
    return value;
  }
  return value
    .replace(/\bAdditional\s+className\s+for\b/gi, "StyleX styles applied to")
    .replace(/\bAdditional\s+class\s+name\s+for\b/gi, "StyleX styles applied to")
    .replace(/\bclassName\b/gi, "StyleX styles")
    .replace(/\bclass name\b/gi, "StyleX styles");
}

function buildSxExpression(j: JSCodeshift, propsBinding: PropsBinding): JsxExpression {
  if (propsBinding.kind === "destructured") {
    if (propsBinding.restLocal) {
      return j.memberExpression(j.identifier(propsBinding.restLocal), j.identifier("sx"));
    }
    return j.identifier(propsBinding.sxLocal);
  }
  return j.memberExpression(j.identifier(propsBinding.propsLocal), j.identifier("sx"));
}

function addSxToForwardedChildren(args: {
  ctx: TransformContext;
  fn: FunctionLike;
  fnPath: ScopedAstPath;
  convertedWrapperBindings: Map<string, ScopedAstPath>;
  propsBinding: PropsBinding;
  sxExpression: JsxExpression;
}): boolean {
  const { ctx, fn, fnPath, convertedWrapperBindings, propsBinding, sxExpression } = args;
  const body = fn.body as ASTNode | undefined;
  if (!body) {
    return false;
  }
  const propsBindingScope = findPropsBindingScope(fnPath, propsBinding);
  if (!propsBindingScope) {
    return false;
  }

  let changed = false;
  ctx
    .j(fnPath)
    .find(ctx.j.JSXOpeningElement)
    .forEach((path: ScopedAstPath) => {
      const opening = path.node;
      const childName = opening.name?.type === "JSXIdentifier" ? opening.name.name : undefined;
      const convertedBindingScope = childName ? convertedWrapperBindings.get(childName) : undefined;
      if (
        !childName ||
        !convertedBindingScope ||
        !isConvertedChildBinding(ctx, path, childName, convertedBindingScope) ||
        hasJsxAttr(opening, "sx")
      ) {
        return;
      }

      const classNameAttr = getJsxAttr(opening, "className");
      if (
        !classNameAttr ||
        !isForwardedClassNameAttr(classNameAttr, propsBinding) ||
        !isInPropsBindingScope(path, propsBinding, propsBindingScope)
      ) {
        return;
      }

      insertSxAttribute(ctx, opening, sxExpression);
      changed = true;
    });

  return changed;
}

function insertSxAttribute(
  ctx: TransformContext,
  opening: { attributes?: any[] | null },
  sxExpression: JsxExpression,
): void {
  const sxAttr = ctx.j.jsxAttribute(
    ctx.j.jsxIdentifier("sx"),
    ctx.j.jsxExpressionContainer(cloneExpression(sxExpression)),
  );
  const attributes = opening.attributes ?? [];
  const firstSpreadIndex = attributes.findIndex((attr) => attr?.type === "JSXSpreadAttribute");
  const insertionIndex = firstSpreadIndex === -1 ? attributes.length : firstSpreadIndex;
  opening.attributes = [
    ...attributes.slice(0, insertionIndex),
    sxAttr,
    ...attributes.slice(insertionIndex),
  ];
}

function isConvertedChildBinding(
  ctx: TransformContext,
  path: ScopedAstPath,
  childName: string,
  convertedBindingPath: ScopedAstPath,
): boolean {
  return findNearestValueBindingPath(ctx, path, childName)?.node === convertedBindingPath.node;
}

function findNearestValueBindingPath(
  ctx: TransformContext,
  referencePath: ScopedAstPath,
  name: string,
): ScopedAstPath | null {
  let bestPath: ScopedAstPath | null = null;
  let bestDepth = -1;
  const considerBindingPath = (
    bindingPath: ScopedAstPath,
    containerPath: ScopedAstPath | null,
  ): void => {
    if (!containerPath || !pathContains(containerPath, referencePath)) {
      return;
    }
    const depth = pathDepth(containerPath);
    if (depth > bestDepth) {
      bestPath = bindingPath;
      bestDepth = depth;
    }
  };

  ctx.root.find(ctx.j.FunctionDeclaration).forEach((path: ScopedAstPath) => {
    if (path.node.id?.name === name) {
      considerBindingPath(path, getLexicalContainerPath(path));
    }
    if (functionHasParamBinding(path.node, name)) {
      considerBindingPath(path, path);
    }
  });

  ctx.root.find(ctx.j.FunctionExpression).forEach((path: ScopedAstPath) => {
    if (functionHasParamBinding(path.node, name)) {
      considerBindingPath(path, path);
    }
  });

  ctx.root.find(ctx.j.ArrowFunctionExpression).forEach((path: ScopedAstPath) => {
    if (functionHasParamBinding(path.node, name)) {
      considerBindingPath(path, path);
    }
  });

  ctx.root.find(ctx.j.ClassDeclaration).forEach((path: ScopedAstPath) => {
    if (path.node.id?.name === name) {
      considerBindingPath(path, getLexicalContainerPath(path));
    }
  });

  ctx.root.find(ctx.j.ClassExpression).forEach((path: ScopedAstPath) => {
    if (path.node.id?.name === name) {
      considerBindingPath(path, path);
    }
  });

  ctx.root.find(ctx.j.VariableDeclarator).forEach((path: ScopedAstPath) => {
    if (patternHasBindingName(path.node.id, name)) {
      considerBindingPath(path, getLexicalContainerPath(path));
    }
  });

  return bestPath;
}

function isTopLevelValueBindingPath(path: ScopedAstPath): boolean {
  return getLexicalContainerPath(path)?.node?.type === "Program";
}

function functionHasParamBinding(fn: FunctionLike, name: string): boolean {
  return (fn.params ?? []).some((param) => patternHasBindingName(param, name));
}

function patternHasBindingName(node: unknown, name: string): boolean {
  const names = new Set<string>();
  collectPatternBindingNames(node, names);
  return names.has(name);
}

function findPropsBindingScope(fnPath: ScopedAstPath, propsBinding: PropsBinding): object | null {
  const bindingName =
    propsBinding.kind === "destructured" ? propsBinding.classNameLocal : propsBinding.propsLocal;
  return findBindingScope(fnPath, bindingName);
}

function isInPropsBindingScope(
  path: ScopedAstPath,
  propsBinding: PropsBinding,
  bindingScope: object,
): boolean {
  const bindingName =
    propsBinding.kind === "destructured" ? propsBinding.classNameLocal : propsBinding.propsLocal;
  return isInBindingScope(path, bindingName, bindingScope);
}

function findBindingScope(path: ScopedAstPath, bindingName: string): object | null {
  let scope: object | null | undefined;
  try {
    scope = path.scope?.lookup?.(bindingName);
  } catch {
    return null;
  }
  return scope && typeof scope === "object" ? scope : null;
}

function isInBindingScope(path: ScopedAstPath, bindingName: string, bindingScope: object): boolean {
  return findBindingScope(path, bindingName) === bindingScope;
}

function addSxDestructure(ctx: TransformContext, propsBinding: PropsBinding): void {
  if (
    propsBinding.kind !== "destructured" ||
    propsBinding.restLocal ||
    hasObjectPatternProp(propsBinding.pattern, "sx")
  ) {
    return;
  }
  const properties = [...(propsBinding.pattern.properties ?? [])];
  const restIndex = properties.findIndex(isObjectPatternRestElement);
  properties.splice(
    restIndex === -1 ? properties.length : restIndex,
    0,
    ctx.patternProp("sx", ctx.j.identifier(propsBinding.sxLocal)),
  );
  propsBinding.pattern.properties = properties;
}

function isObjectPatternRestElement(prop: any): boolean {
  return prop?.type === "RestElement" || prop?.type === "RestProperty";
}

function getObjectPatternRestLocal(pattern: any): string | null {
  const rest = (pattern.properties ?? []).find(isObjectPatternRestElement);
  return rest?.argument?.type === "Identifier" ? rest.argument.name : null;
}

function getJsxAttr(opening: any, attrName: string): any {
  return (
    (opening.attributes ?? []).find(
      (attr: any) => attr?.type === "JSXAttribute" && attr.name?.name === attrName,
    ) ?? null
  );
}

function hasJsxAttr(opening: any, attrName: string): boolean {
  return Boolean(getJsxAttr(opening, attrName));
}

function isForwardedClassNameAttr(attr: any, propsBinding: PropsBinding): boolean {
  const expr = attr.value?.type === "JSXExpressionContainer" ? attr.value.expression : null;
  if (!expr) {
    return false;
  }
  if (propsBinding.kind === "destructured") {
    return expr.type === "Identifier" && expr.name === propsBinding.classNameLocal;
  }
  return (
    expr.type === "MemberExpression" &&
    expr.object?.type === "Identifier" &&
    expr.object.name === propsBinding.propsLocal &&
    expr.property?.type === "Identifier" &&
    expr.property.name === "className"
  );
}

function getObjectPatternKeyName(prop: any): string | null {
  if (prop?.type !== "Property" && prop?.type !== "ObjectProperty") {
    return null;
  }
  const key = prop.key;
  if (key?.type === "Identifier") {
    return key.name;
  }
  if (key?.type === "StringLiteral" || key?.type === "Literal") {
    return typeof key.value === "string" ? key.value : null;
  }
  return null;
}

function getObjectPatternValueName(prop: any): string | null {
  if (!prop) {
    return null;
  }
  const value = prop.value;
  if (value?.type === "Identifier") {
    return value.name;
  }
  if (value?.type === "AssignmentPattern" && value.left?.type === "Identifier") {
    return value.left.name;
  }
  return null;
}

function hasObjectPatternProp(pattern: any, propName: string): boolean {
  return (pattern.properties ?? []).some((prop: any) => getObjectPatternKeyName(prop) === propName);
}

function getExistingSxLocal(pattern: any): string {
  const sxProp = (pattern.properties ?? []).find(
    (prop: any) => getObjectPatternKeyName(prop) === "sx",
  );
  return getObjectPatternValueName(sxProp) ?? "sx";
}

function getAvailableSxLocalName(fn: FunctionLike): string {
  const usedNames = new Set<string>();
  for (const param of fn.params ?? []) {
    collectPatternBindingNames(param, usedNames);
    collectIdentifierNames(param, usedNames);
  }
  collectBindingNames(fn.body, usedNames);
  collectIdentifierNames(fn.body, usedNames);
  if (!usedNames.has("sx")) {
    return "sx";
  }
  if (!usedNames.has("sxProp")) {
    return "sxProp";
  }
  let suffix = 2;
  while (usedNames.has(`sxProp${suffix}`)) {
    suffix++;
  }
  return `sxProp${suffix}`;
}

function collectIdentifierNames(
  node: unknown,
  names: Set<string>,
  visited = new WeakSet<object>(),
): void {
  if (!node || typeof node !== "object") {
    return;
  }
  if (visited.has(node)) {
    return;
  }
  visited.add(node);

  const astNode = node as Record<string, unknown>;
  if (astNode.type === "Identifier" && typeof astNode.name === "string") {
    names.add(astNode.name);
    return;
  }

  for (const value of Object.values(astNode)) {
    if (!value) {
      continue;
    }
    if (Array.isArray(value)) {
      for (const item of value) {
        collectIdentifierNames(item, names, visited);
      }
    } else if (typeof value === "object") {
      collectIdentifierNames(value, names, visited);
    }
  }
}

function collectBindingNames(
  node: unknown,
  names: Set<string>,
  visited = new WeakSet<object>(),
): void {
  if (!node || typeof node !== "object") {
    return;
  }
  if (visited.has(node)) {
    return;
  }
  visited.add(node);
  const astNode = node as Record<string, unknown>;
  if (astNode.type === "Identifier" && typeof astNode.name === "string") {
    return;
  }
  if (typeof astNode.id === "object" && astNode.id !== null) {
    collectPatternBindingNames(astNode.id, names);
  }
  if (Array.isArray(astNode.params)) {
    for (const param of astNode.params) {
      collectPatternBindingNames(param, names);
    }
  }
  for (const value of Object.values(astNode)) {
    if (!value || value === astNode.id || value === astNode.params) {
      continue;
    }
    if (Array.isArray(value)) {
      for (const item of value) {
        collectBindingNames(item, names, visited);
      }
    } else if (typeof value === "object") {
      collectBindingNames(value, names, visited);
    }
  }
}

function collectPatternBindingNames(node: unknown, names: Set<string>): void {
  if (!node || typeof node !== "object") {
    return;
  }
  const astNode = node as Record<string, unknown>;
  if (astNode.type === "Identifier" && typeof astNode.name === "string") {
    names.add(astNode.name);
    return;
  }
  if (astNode.type === "RestElement") {
    collectPatternBindingNames(astNode.argument, names);
    return;
  }
  if (astNode.type === "AssignmentPattern") {
    collectPatternBindingNames(astNode.left, names);
    return;
  }
  if (astNode.type === "ArrayPattern") {
    for (const element of (astNode.elements as unknown[] | undefined) ?? []) {
      collectPatternBindingNames(element, names);
    }
    return;
  }
  if (astNode.type === "ObjectPattern") {
    for (const property of (astNode.properties as unknown[] | undefined) ?? []) {
      if (!property || typeof property !== "object") {
        continue;
      }
      const prop = property as Record<string, unknown>;
      if (prop.type === "RestElement") {
        collectPatternBindingNames(prop.argument, names);
      } else {
        collectPatternBindingNames(prop.value, names);
      }
    }
  }
}

function cloneExpression(expression: JsxExpression): JsxExpression {
  return JSON.parse(JSON.stringify(expression)) as JsxExpression;
}

/**
 * Step: add sx pass-through props for local wrappers that forward className.
 * Core concepts: typed wrapper props and converted child component forwarding.
 */
import type { ASTNode, ASTPath, JSCodeshift } from "jscodeshift";
import { CONTINUE, type StepResult, type StyledDecl } from "../transform-types.js";
import type { TransformContext } from "../transform-context.js";

/**
 * Adds an `sx` prop to typed wrapper components that pass their `className`
 * prop through to converted styled-component wrappers.
 */
export function propagateSxFromClassNameStep(ctx: TransformContext): StepResult {
  const convertedWrapperNames = collectConvertedWrapperNames(ctx);
  if (convertedWrapperNames.size === 0) {
    return CONTINUE;
  }

  const components = collectComponentCandidates(ctx);
  for (const component of components) {
    if (convertedWrapperNames.has(component.name)) {
      continue;
    }

    const propsBinding = getPropsBinding(component.fn);
    if (!propsBinding) {
      continue;
    }

    const propsType = getPropsType(ctx, propsBinding.typeName);
    if (!propsType) {
      continue;
    }

    const propsTypeAlreadyHasSx = propsTypeHasProp(propsType.members, "sx");
    const classNameMember = propsType.members.find(
      (member) => getMemberName(member) === "className",
    );
    if (!classNameMember) {
      continue;
    }

    const sxExpression = buildSxExpression(ctx.j, propsBinding);
    const changedJsx = addSxToForwardedChildren({
      ctx,
      fn: component.fn,
      fnPath: component.fnPath,
      convertedWrapperNames,
      propsBinding,
      sxExpression,
    });
    if (!changedJsx) {
      continue;
    }

    if (!propsTypeAlreadyHasSx) {
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

type ScopedAstPath = ASTPath<any> & {
  scope?: {
    lookup?: (name: string) => object | null | undefined;
  };
};

type PropsBinding =
  | {
      kind: "destructured";
      pattern: any;
      typeName: string;
      classNameLocal: string;
      sxLocal: string;
    }
  | {
      kind: "propsObject";
      propsLocal: string;
      typeName: string;
    };

function collectConvertedWrapperNames(ctx: TransformContext): Set<string> {
  const names = new Set<string>();
  const styledDecls = ctx.styledDecls as StyledDecl[] | undefined;
  for (const decl of styledDecls ?? []) {
    if (decl.needsWrapperComponent && !decl.isCssHelper && !decl.skipTransform) {
      names.add(decl.localName);
    }
  }
  return names;
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
    return {
      kind: "destructured",
      pattern: firstParam,
      typeName,
      classNameLocal,
      sxLocal: hasObjectPatternProp(firstParam, "sx")
        ? getExistingSxLocal(firstParam)
        : getAvailableSxLocalName(fn),
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
): { members: any[]; replaceMembers: (members: any[]) => void } | null {
  const { root, j } = ctx;

  const interfaces = root.find(j.TSInterfaceDeclaration, {
    id: { type: "Identifier", name: typeName },
  } as any);
  if (interfaces.size() > 0) {
    const iface = interfaces.at(0).nodes()[0] as any;
    return {
      members: iface.body?.body ?? [],
      replaceMembers(members) {
        iface.body.body = members;
      },
    };
  }

  const aliases = root.find(j.TSTypeAliasDeclaration, {
    id: { type: "Identifier", name: typeName },
  } as any);
  if (aliases.size() === 0) {
    return null;
  }
  const alias = aliases.at(0).nodes()[0] as any;
  if (alias.typeAnnotation?.type !== "TSTypeLiteral") {
    return null;
  }
  return {
    members: alias.typeAnnotation.members ?? [],
    replaceMembers(members) {
      alias.typeAnnotation.members = members;
    },
  };
}

function propsTypeHasProp(members: any[], propName: string): boolean {
  return members.some((member) => getMemberName(member) === propName);
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
    return j.identifier(propsBinding.sxLocal);
  }
  return j.memberExpression(j.identifier(propsBinding.propsLocal), j.identifier("sx"));
}

function addSxToForwardedChildren(args: {
  ctx: TransformContext;
  fn: FunctionLike;
  fnPath: ScopedAstPath;
  convertedWrapperNames: Set<string>;
  propsBinding: PropsBinding;
  sxExpression: JsxExpression;
}): boolean {
  const { ctx, fn, fnPath, convertedWrapperNames, propsBinding, sxExpression } = args;
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
      if (!childName || !convertedWrapperNames.has(childName) || hasJsxAttr(opening, "sx")) {
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

      opening.attributes = [
        ...(opening.attributes ?? []),
        ctx.j.jsxAttribute(
          ctx.j.jsxIdentifier("sx"),
          ctx.j.jsxExpressionContainer(cloneExpression(sxExpression)),
        ),
      ];
      changed = true;
    });

  return changed;
}

function findPropsBindingScope(fnPath: ScopedAstPath, propsBinding: PropsBinding): object | null {
  const bindingName =
    propsBinding.kind === "destructured" ? propsBinding.classNameLocal : propsBinding.propsLocal;
  const scope = fnPath.scope?.lookup?.(bindingName);
  return scope && typeof scope === "object" ? scope : null;
}

function isInPropsBindingScope(
  path: ScopedAstPath,
  propsBinding: PropsBinding,
  bindingScope: object,
): boolean {
  const bindingName =
    propsBinding.kind === "destructured" ? propsBinding.classNameLocal : propsBinding.propsLocal;
  return path.scope?.lookup?.(bindingName) === bindingScope;
}

function addSxDestructure(ctx: TransformContext, propsBinding: PropsBinding): void {
  if (propsBinding.kind !== "destructured" || hasObjectPatternProp(propsBinding.pattern, "sx")) {
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
  }
  collectBindingNames(fn.body, usedNames);
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
  for (const value of Object.values(astNode)) {
    if (!value || value === astNode.id) {
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

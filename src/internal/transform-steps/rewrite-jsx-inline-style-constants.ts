/**
 * Emits hoisted `const <Name>InlineStyle = {...}` declarations for intrinsic
 * styled components whose static inline styles can be lifted to a shared object,
 * inserted just before the `stylex.create(...)` styles declaration.
 */
import type { StyledDecl } from "../transform-types.js";
import { TransformContext } from "../transform-context.js";
import { type ExpressionKind } from "../utilities/jscodeshift-utils.js";
import { toStyleKey } from "../transform/helpers.js";

export function emitStaticInlineStyleConstants(
  ctx: TransformContext,
  styledDecls: StyledDecl[],
): void {
  const { root, j } = ctx;
  const decls = styledDecls.filter(
    (decl) =>
      !decl.skipTransform &&
      !decl.needsWrapperComponent &&
      decl.base.kind === "intrinsic" &&
      (decl.staticInlineStyleProps?.length ?? 0) > 0,
  );
  if (decls.length === 0) {
    return;
  }

  const existingNames = collectTopLevelBindingNames(root, j);
  const programBody = root.get().node.program.body as unknown[];
  const stylesIndex = programBody.findIndex(isStylexCreateStylesDeclaration);
  const insertAt = stylesIndex >= 0 ? stylesIndex : programBody.length;
  const declarations: unknown[] = [];

  for (const decl of decls) {
    const baseName = `${toStyleKey(decl.localName)}InlineStyle`;
    const constName = uniqueBindingName(baseName, existingNames);
    existingNames.add(constName);
    decl.staticInlineStyleConstName = constName;

    const objectExpression = j.objectExpression(
      (decl.staticInlineStyleProps ?? []).map((prop) => staticInlineStylePropToProperty(j, prop)),
    );
    const hasCustomProperties = (decl.staticInlineStyleProps ?? []).some((prop) =>
      prop.prop.startsWith("--"),
    );
    const reactCssPropertiesType = j.tsTypeReference(
      j.tsQualifiedName(j.identifier("React"), j.identifier("CSSProperties")),
    );
    const initializer = shouldEmitTypes(ctx.file.path)
      ? hasCustomProperties
        ? (j.tsAsExpression(objectExpression, reactCssPropertiesType) as unknown as ExpressionKind)
        : ({
            type: "TSSatisfiesExpression",
            expression: objectExpression,
            typeAnnotation: reactCssPropertiesType,
          } as unknown as ExpressionKind)
      : objectExpression;

    declarations.push(
      j.variableDeclaration("const", [j.variableDeclarator(j.identifier(constName), initializer)]),
    );
  }

  programBody.splice(insertAt, 0, ...(declarations as typeof programBody));
  if (shouldEmitTypes(ctx.file.path)) {
    ctx.needsReactImport = true;
    ctx.needsReactNamespaceImport = true;
  }
  ctx.markChanged();
}

function shouldEmitTypes(filePath: string): boolean {
  return /\.(ts|tsx)$/.test(filePath);
}

function staticInlineStylePropToProperty(
  j: TransformContext["j"]["jscodeshift"],
  prop: { prop: string; expr: ExpressionKind },
): ReturnType<TransformContext["j"]["jscodeshift"]["property"]> {
  const key = prop.prop.includes(".")
    ? parseStyleKeyExpression(j, prop.prop)
    : isValidStaticInlineStyleIdentifier(prop.prop)
      ? j.identifier(prop.prop)
      : j.literal(prop.prop);
  const property = j.property("init", key, prop.expr);
  if (prop.prop.includes(".")) {
    (property as { computed?: boolean }).computed = true;
  }
  return property;
}

function isValidStaticInlineStyleIdentifier(prop: string): boolean {
  return /^[A-Za-z_$][0-9A-Za-z_$]*$/.test(prop);
}

function parseStyleKeyExpression(
  j: TransformContext["j"]["jscodeshift"],
  prop: string,
): ExpressionKind {
  const [root, member] = prop.split(".");
  if (!root || !member || prop.split(".").length !== 2) {
    return j.identifier(prop);
  }
  return j.memberExpression(j.identifier(root), j.identifier(member));
}

function collectTopLevelBindingNames(
  root: TransformContext["root"],
  j: TransformContext["j"]["jscodeshift"],
): Set<string> {
  const names = new Set<string>();
  root.find(j.Identifier).forEach((path) => {
    const node = path.node as { name?: unknown };
    if (typeof node.name === "string") {
      names.add(node.name);
    }
  });
  return names;
}

function uniqueBindingName(baseName: string, usedNames: ReadonlySet<string>): string {
  if (!usedNames.has(baseName)) {
    return baseName;
  }
  let suffix = 2;
  while (usedNames.has(`${baseName}${suffix}`)) {
    suffix++;
  }
  return `${baseName}${suffix}`;
}

function isStylexCreateStylesDeclaration(node: unknown): boolean {
  const declaration = node as {
    type?: string;
    declarations?: Array<{
      init?: {
        type?: string;
        callee?: {
          type?: string;
          object?: { type?: string; name?: string };
          property?: { type?: string; name?: string };
        };
      };
    }>;
  };
  if (declaration.type !== "VariableDeclaration") {
    return false;
  }
  return (declaration.declarations ?? []).some((decl) => {
    const callee = decl.init?.callee;
    return (
      decl.init?.type === "CallExpression" &&
      callee?.type === "MemberExpression" &&
      callee.object?.type === "Identifier" &&
      callee.object.name === "stylex" &&
      callee.property?.type === "Identifier" &&
      callee.property.name === "create"
    );
  });
}

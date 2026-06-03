/**
 * Step: convert styled-components keyframes to stylex.keyframes.
 * Core concepts: keyframes detection and import updates.
 */
import {
  collectStyledKeyframeNames,
  convertStyledKeyframes,
  GENERATED_STYLEX_KEYFRAMES_ALIAS_COMMENT,
} from "../keyframes.js";
import type { ASTNode, ASTPath } from "jscodeshift";
import { CONTINUE, type StepResult } from "../transform-types.js";
import { TransformContext } from "../transform-context.js";
import { objectToAst } from "../transform/helpers.js";
import { collectIdentifiers } from "../utilities/jscodeshift-utils.js";

/**
 * Tracks styled-components keyframes names before partial lowering decides which
 * styled templates can be safely transformed.
 *
 * Also collects the names of pre-existing `stylex.keyframes(...)` declarations in the
 * file, so that incremental migrations (e.g. a leaves-only pass followed by a full
 * migration) can still recognize keyframe identifiers when expanding `animation`
 * shorthands in the surviving styled-components declarations.
 */
export function convertKeyframesStep(ctx: TransformContext): StepResult {
  const { styledImports, j, root } = ctx;
  if (!styledImports) {
    return CONTINUE;
  }

  // Convert `styled-components` keyframes to `stylex.keyframes`.
  // Docs: https://stylexjs.com/docs/api/javascript/keyframes
  const keyframesImport = styledImports
    .find(j.ImportSpecifier)
    .nodes()
    .find((s: any) => s.imported.type === "Identifier" && s.imported.name === "keyframes");
  const keyframesLocal =
    keyframesImport?.local?.type === "Identifier"
      ? keyframesImport.local.name
      : keyframesImport?.imported?.type === "Identifier"
        ? keyframesImport.imported.name
        : undefined;

  ctx.keyframesLocal = keyframesLocal;

  if (keyframesLocal) {
    ctx.keyframesNames = collectStyledKeyframeNames({
      root,
      j,
      keyframesLocal,
    });
  }

  // Pick up names of existing `const <name> = stylex.keyframes(...)` declarations
  // so subsequent transform passes still see them as keyframes when expanding
  // `animation` shorthands. This matters for incremental migration flows where a
  // previous run already converted `keyframes\`...\`` and removed the `keyframes`
  // import, but other styled-components decls in the same file still reference
  // the keyframe binding via interpolation.
  collectExistingStylexKeyframeNames(ctx);

  return CONTINUE;
}

/**
 * Converts styled-components keyframes usage to stylex.keyframes after partial
 * lowering has marked skipped declarations. Keyframes referenced by preserved
 * styled templates must remain as styled-components `keyframes` templates so the
 * preserved template receives the runtime animation name string it expects.
 */
export function finalizeKeyframesStep(ctx: TransformContext): StepResult {
  const { styledImports, keyframesLocal, j, root } = ctx;
  if (!styledImports || !keyframesLocal) {
    return CONTINUE;
  }

  const preservedNames = collectKeyframesReferencedBySkippedDecls(ctx);
  const duplicateNames = buildDuplicateKeyframesNames(ctx, preservedNames);
  const converted = convertStyledKeyframes({
    root,
    j,
    styledImports,
    keyframesLocal,
    objectToAst,
    preserveNames: preservedNames,
    duplicateNames,
    shouldKeepModuleKeyframesInPlace: ({ localName, declaratorPath }) =>
      hasSurvivingTopLevelReadAfterDeclaration(ctx, localName, declaratorPath),
  });
  if (converted.stylexKeyframes.length > 0) {
    ctx.stylexKeyframes = [...(ctx.stylexKeyframes ?? []), ...converted.stylexKeyframes];
  }
  if (duplicateNames.size > 0) {
    ctx.keyframesAliases = new Map([...(ctx.keyframesAliases ?? new Map()), ...duplicateNames]);
  }
  ctx.keyframesNames = new Set([...ctx.keyframesNames, ...converted.keyframesNames]);
  replaceKeyframesAliasesInResolvedStyles(ctx);
  if (
    preservedNames.size === 0 &&
    collapseGeneratedKeyframesAliases(ctx, converted.keyframesNames)
  ) {
    ctx.markChanged();
  }
  if (converted.changed) {
    ctx.markChanged();
  }
  cleanupEmptyVariableDeclarations(ctx);

  collectExistingStylexKeyframeNames(ctx);

  return CONTINUE;
}

// --- Non-exported helpers ---

function collectKeyframesReferencedBySkippedDecls(ctx: TransformContext): Set<string> {
  return collectKeyframesReferencedByDecls(ctx, (decl) => !!decl.skipTransform);
}

function hasSurvivingTopLevelReadAfterDeclaration(
  ctx: TransformContext,
  localName: string,
  declaratorPath: ASTPath<ASTNode>,
): boolean {
  const programBody = ctx.root.get().node.program.body as ASTNode[];
  const declarationStatement = findTopLevelStatementNode(declaratorPath);
  if (!declarationStatement) {
    return false;
  }
  const declarationIndex = programBody.indexOf(declarationStatement);
  if (declarationIndex < 0) {
    return false;
  }
  if (
    statementHasRuntimeReadAfterDeclarator(declarationStatement, declaratorPath.node, localName)
  ) {
    return true;
  }

  const removedStyledDeclNames = new Set(
    (ctx.styledDecls ?? []).filter((decl) => !decl.skipTransform).map((decl) => decl.localName),
  );

  return programBody.some((statement, index) => {
    if (
      index <= declarationIndex ||
      isRemovedStyledDeclarationStatement(statement, removedStyledDeclNames)
    ) {
      return false;
    }
    return nodeContainsRuntimeIdentifierRead(statement, localName);
  });
}

function statementHasRuntimeReadAfterDeclarator(
  statement: ASTNode,
  targetDeclarator: ASTNode,
  localName: string,
): boolean {
  const declaration =
    statement.type === "ExportNamedDeclaration" ? statement.declaration : statement;
  if (declaration?.type !== "VariableDeclaration") {
    return false;
  }

  let foundTarget = false;
  for (const declarator of declaration.declarations) {
    if (declarator === targetDeclarator) {
      foundTarget = true;
      continue;
    }
    if (
      foundTarget &&
      declarator.type === "VariableDeclarator" &&
      nodeContainsRuntimeIdentifierRead(declarator.init, localName)
    ) {
      return true;
    }
  }
  return false;
}

function isRemovedStyledDeclarationStatement(
  statement: ASTNode,
  styledDeclNames: Set<string>,
): boolean {
  const declaration =
    statement.type === "ExportNamedDeclaration" ? statement.declaration : statement;
  if (declaration?.type !== "VariableDeclaration") {
    return false;
  }
  return declaration.declarations.some((declarator) => {
    const id = declarator.type === "VariableDeclarator" ? declarator.id : null;
    return id?.type === "Identifier" && styledDeclNames.has(id.name);
  });
}

function findTopLevelStatementNode(path: ASTPath<ASTNode>): ASTNode | null {
  let current: any = path;
  while (current?.parentPath) {
    const parent = current.parentPath;
    const grandparent = parent.parentPath;
    if (Array.isArray(parent.value) && grandparent?.value?.type === "Program") {
      return (current.value ?? current.node) as ASTNode;
    }
    current = parent;
  }
  return null;
}

function nodeContainsRuntimeIdentifierRead(
  node: unknown,
  localName: string,
  parent?: { type?: string; key?: unknown; property?: unknown; computed?: boolean; id?: unknown },
): boolean {
  if (!node || typeof node !== "object") {
    return false;
  }
  if (Array.isArray(node)) {
    return node.some((child) => nodeContainsRuntimeIdentifierRead(child, localName, parent));
  }

  const typed = node as { type?: string; name?: string };
  if (shouldSkipRuntimeReadTraversal(typed)) {
    return false;
  }
  if (typed.type === "Identifier" && typed.name === localName) {
    return !isNonRuntimeIdentifierRead(node, parent);
  }

  for (const key of Object.keys(node as Record<string, unknown>)) {
    if (key === "loc" || key === "comments" || key === "leadingComments" || isTypeOnlyAstKey(key)) {
      continue;
    }
    if (
      nodeContainsRuntimeIdentifierRead((node as Record<string, unknown>)[key], localName, typed)
    ) {
      return true;
    }
  }
  return false;
}

function shouldSkipRuntimeReadTraversal(node: { type?: string }): boolean {
  return (
    node.type === "FunctionDeclaration" ||
    node.type === "FunctionExpression" ||
    node.type === "ArrowFunctionExpression" ||
    node.type === "ClassMethod" ||
    node.type === "ClassPrivateMethod" ||
    node.type === "MethodDefinition" ||
    node.type === "ObjectMethod" ||
    node.type === "ImportDeclaration" ||
    node.type === "ImportSpecifier" ||
    node.type === "ImportDefaultSpecifier" ||
    node.type === "ImportNamespaceSpecifier" ||
    node.type === "TSTypeAliasDeclaration" ||
    node.type === "TSInterfaceDeclaration" ||
    node.type === "TSImportEqualsDeclaration"
  );
}

function isTypeOnlyAstKey(key: string): boolean {
  return (
    key === "typeAnnotation" ||
    key === "typeParameters" ||
    key === "typeArguments" ||
    key === "typeParameter" ||
    key === "typeParameterInstantiation" ||
    key === "returnType" ||
    key === "implements"
  );
}

function isNonRuntimeIdentifierRead(
  node: unknown,
  parent:
    | { type?: string; key?: unknown; property?: unknown; computed?: boolean; id?: unknown }
    | undefined,
): boolean {
  return (
    (parent?.type === "VariableDeclarator" && parent.id === node) ||
    ((parent?.type === "Property" || parent?.type === "ObjectProperty") &&
      parent.key === node &&
      !parent.computed) ||
    ((parent?.type === "MemberExpression" || parent?.type === "OptionalMemberExpression") &&
      parent.property === node &&
      !parent.computed)
  );
}

function buildDuplicateKeyframesNames(
  ctx: TransformContext,
  preservedNames: Set<string>,
): Map<string, string> {
  const duplicates = new Map<string, string>();
  if (preservedNames.size === 0) {
    return duplicates;
  }

  const usedNames = collectBindingNames(ctx);
  const transformedReferences = collectKeyframesReferencedByDecls(
    ctx,
    (decl) => !decl.skipTransform,
  );
  for (const name of transformedReferences) {
    if (!preservedNames.has(name) || duplicates.has(name)) {
      continue;
    }
    const duplicateName = makeUniqueKeyframesDuplicateName(name, usedNames);
    duplicates.set(name, duplicateName);
    usedNames.add(duplicateName);
  }

  return duplicates;
}

function collectKeyframesReferencedByDecls(
  ctx: TransformContext,
  shouldVisitDecl: (decl: NonNullable<TransformContext["styledDecls"]>[number]) => boolean,
): Set<string> {
  const referencedNames = new Set<string>();
  if (!ctx.styledDecls || ctx.keyframesNames.size === 0) {
    return referencedNames;
  }

  for (const decl of ctx.styledDecls) {
    if (!shouldVisitDecl(decl)) {
      continue;
    }
    for (const expr of decl.templateExpressions ?? []) {
      const identifiers = new Set<string>();
      collectIdentifiers(expr, identifiers);
      for (const name of identifiers) {
        if (ctx.keyframesNames.has(name)) {
          referencedNames.add(name);
        }
      }
    }
  }
  return referencedNames;
}

function collectBindingNames(ctx: TransformContext): Set<string> {
  const names = new Set<string>(ctx.keyframesNames);
  ctx.root.find(ctx.j.VariableDeclarator).forEach((path: { node: { id: ASTNode } }) => {
    collectPatternBindingNames(path.node.id, names);
  });
  ctx.root.find(ctx.j.FunctionDeclaration).forEach((path: { node: { id?: ASTNode | null } }) => {
    collectPatternBindingNames(path.node.id, names);
  });
  ctx.root.find(ctx.j.ClassDeclaration).forEach((path: { node: { id?: ASTNode | null } }) => {
    collectPatternBindingNames(path.node.id, names);
  });
  return names;
}

function collectPatternBindingNames(node: unknown, names: Set<string>): void {
  if (!node || typeof node !== "object") {
    return;
  }
  if (Array.isArray(node)) {
    for (const child of node) {
      collectPatternBindingNames(child, names);
    }
    return;
  }
  const typed = node as { type?: string; name?: string };
  if (typed.type === "Identifier" && typed.name) {
    names.add(typed.name);
    return;
  }
  if (
    typed.type === "MemberExpression" ||
    typed.type === "OptionalMemberExpression" ||
    typed.type === "TSQualifiedName"
  ) {
    return;
  }
  for (const key of Object.keys(node as Record<string, unknown>)) {
    if (key === "loc" || key === "comments" || key === "leadingComments") {
      continue;
    }
    collectPatternBindingNames((node as Record<string, unknown>)[key], names);
  }
}

function makeUniqueKeyframesDuplicateName(name: string, usedNames: Set<string>): string {
  let candidate = `${name}Stylex`;
  let suffix = 2;
  while (usedNames.has(candidate)) {
    candidate = `${name}Stylex${suffix}`;
    suffix += 1;
  }
  return candidate;
}

function collapseGeneratedKeyframesAliases(
  ctx: TransformContext,
  convertedNames: Set<string>,
): boolean {
  let changed = false;
  for (const name of convertedNames) {
    const alias = `${name}Stylex`;
    const aliasScope = getGeneratedStylexKeyframesDeclarationScope(ctx, alias);
    if (!aliasScope) {
      continue;
    }
    renameKeyframesAliasReferences(ctx, alias, name, aliasScope);
    changed = true;
  }
  return changed;
}

function getGeneratedStylexKeyframesDeclarationScope(
  ctx: TransformContext,
  localName: string,
): object | null {
  let aliasScope: object | null = null;
  ctx.root
    .find(ctx.j.VariableDeclarator, { id: { type: "Identifier", name: localName } } as any)
    .forEach((path: any) => {
      if (aliasScope) {
        return;
      }
      const declaration = path.parentPath?.node;
      if (
        !declaration ||
        declaration.type !== "VariableDeclaration" ||
        !isGeneratedStylexKeyframesDeclaration(path.node, declaration)
      ) {
        return;
      }
      const scope = path.scope?.lookup?.(localName);
      aliasScope = scope && typeof scope === "object" ? scope : null;
      declaration.declarations = declaration.declarations.filter(
        (decl: unknown) => decl !== path.node,
      );
    });
  return aliasScope;
}

function isGeneratedStylexKeyframesDeclaration(
  declarator: unknown,
  declaration: { comments?: unknown[]; leadingComments?: unknown[] },
): boolean {
  if (!hasGeneratedAliasComment(declaration) || !isStylexKeyframesDeclarator(declarator)) {
    return false;
  }
  return true;
}

function hasGeneratedAliasComment(node: {
  comments?: unknown[];
  leadingComments?: unknown[];
}): boolean {
  const comments = [...(node.comments ?? []), ...(node.leadingComments ?? [])];
  return comments.some(
    (comment) =>
      typeof comment === "object" &&
      comment !== null &&
      "value" in comment &&
      String(comment.value).includes(GENERATED_STYLEX_KEYFRAMES_ALIAS_COMMENT),
  );
}

function isStylexKeyframesDeclarator(declarator: unknown): boolean {
  if (!declarator || typeof declarator !== "object" || !("type" in declarator)) {
    return false;
  }
  const init = (declarator as { init?: unknown }).init;
  return (
    !!init &&
    typeof init === "object" &&
    "type" in init &&
    init.type === "CallExpression" &&
    "callee" in init &&
    !!init.callee &&
    typeof init.callee === "object" &&
    "type" in init.callee &&
    init.callee.type === "MemberExpression" &&
    "object" in init.callee &&
    !!init.callee.object &&
    typeof init.callee.object === "object" &&
    "type" in init.callee.object &&
    init.callee.object.type === "Identifier" &&
    "name" in init.callee.object &&
    init.callee.object.name === "stylex" &&
    "property" in init.callee &&
    !!init.callee.property &&
    typeof init.callee.property === "object" &&
    "type" in init.callee.property &&
    init.callee.property.type === "Identifier" &&
    "name" in init.callee.property &&
    init.callee.property.name === "keyframes"
  );
}

function cleanupEmptyVariableDeclarations(ctx: TransformContext): void {
  ctx.root.find(ctx.j.VariableDeclaration).forEach((path: any) => {
    if (path.node.declarations.length > 0) {
      return;
    }
    ctx.j(path).remove();
    ctx.markChanged();
  });
}

function renameKeyframesAliasReferences(
  ctx: TransformContext,
  fromName: string,
  toName: string,
  aliasScope: object,
): void {
  ctx.root.find(ctx.j.Identifier, { name: fromName } as any).forEach((path: any) => {
    const parent = path.parentPath?.node;
    if (
      !parent ||
      (!isShorthandObjectProperty(parent) && isNonReferenceIdentifier(path.node, parent))
    ) {
      return;
    }
    if (path.scope?.lookup?.(fromName) !== aliasScope) {
      return;
    }
    if (replaceShorthandObjectPropertyAlias(parent, fromName, toName, ctx.j)) {
      return;
    }
    path.node.name = toName;
  });
}

function isNonReferenceIdentifier(node: unknown, parent: any): boolean {
  if (
    parent.type === "ImportSpecifier" ||
    parent.type === "ImportDefaultSpecifier" ||
    parent.type === "ImportNamespaceSpecifier"
  ) {
    return true;
  }
  if (parent.type === "VariableDeclarator" && parent.id === node) {
    return true;
  }
  if (
    (parent.type === "MemberExpression" || parent.type === "OptionalMemberExpression") &&
    parent.property === node &&
    !parent.computed
  ) {
    return true;
  }
  return isStaticObjectPropertyKey(parent, node);
}

function isStaticObjectPropertyKey(
  parent: { type?: string; key?: unknown; computed?: boolean },
  node: unknown,
): boolean {
  return (
    isObjectPropertyNode(parent) &&
    parent.key === node &&
    !parent.computed &&
    !isShorthandObjectProperty(parent)
  );
}

function replaceShorthandObjectPropertyAlias(
  parent: any,
  keyName: string,
  valueName: string,
  j: TransformContext["j"],
): boolean {
  if (isShorthandObjectProperty(parent)) {
    parent.shorthand = false;
    parent.key = j.identifier(keyName);
    parent.value = j.identifier(valueName);
    return true;
  }
  return false;
}

function isShorthandObjectProperty(parent: any): boolean {
  return isObjectPropertyNode(parent) && parent.shorthand === true;
}

function isObjectPropertyNode(parent: { type?: string }): boolean {
  return parent.type === "Property" || parent.type === "ObjectProperty";
}

function replaceKeyframesAliasesInResolvedStyles(ctx: TransformContext): void {
  if (!ctx.resolvedStyleObjects || !ctx.keyframesAliases || ctx.keyframesAliases.size === 0) {
    return;
  }
  for (const value of ctx.resolvedStyleObjects.values()) {
    replaceKeyframesAliases(value, ctx.keyframesAliases);
  }
}

function replaceKeyframesAliases(
  node: unknown,
  aliases: Map<string, string>,
  parent?: { type?: string; key?: unknown; computed?: boolean },
): void {
  if (!node || typeof node !== "object") {
    return;
  }
  if (Array.isArray(node)) {
    for (const child of node) {
      replaceKeyframesAliases(child, aliases, parent);
    }
    return;
  }

  const typed = node as { type?: string; name?: string };
  if (typed.type === "Identifier" && typed.name) {
    const alias = aliases.get(typed.name);
    if (alias && !isStaticObjectPropertyKey(parent ?? {}, node)) {
      typed.name = alias;
    }
  }

  for (const key of Object.keys(node as Record<string, unknown>)) {
    if (key === "loc" || key === "comments") {
      continue;
    }
    replaceKeyframesAliases((node as Record<string, unknown>)[key], aliases, typed);
  }
}

/**
 * Collect identifier names bound to top-level `const <name> = stylex.keyframes(...)`
 * declarations. Restricted to module-level (Program / ExportNamedDeclaration) bindings
 * because nested or block-scoped declarations cannot be safely matched by name when
 * lowering animation shorthands — animation lowering looks up identifiers by name,
 * so collecting nested bindings risks treating an unrelated local `fade` as the
 * module-level keyframe binding referenced by a styled template interpolation.
 */
function collectExistingStylexKeyframeNames(ctx: TransformContext): void {
  const { root, j } = ctx;
  root.find(j.VariableDeclaration).forEach((declPath) => {
    const parentType = declPath.parentPath?.node?.type;
    if (parentType !== "Program" && parentType !== "ExportNamedDeclaration") {
      return;
    }
    for (const declarator of declPath.node.declarations) {
      if (declarator.type !== "VariableDeclarator") {
        continue;
      }
      const id = declarator.id;
      if (id.type !== "Identifier") {
        continue;
      }
      const init = declarator.init;
      if (
        !init ||
        init.type !== "CallExpression" ||
        init.callee.type !== "MemberExpression" ||
        init.callee.object.type !== "Identifier" ||
        init.callee.object.name !== "stylex" ||
        init.callee.property.type !== "Identifier" ||
        init.callee.property.name !== "keyframes"
      ) {
        continue;
      }
      ctx.keyframesNames.add(id.name);
    }
  });
}

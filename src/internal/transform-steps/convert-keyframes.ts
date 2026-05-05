/**
 * Step: convert styled-components keyframes to stylex.keyframes.
 * Core concepts: keyframes detection and import updates.
 */
import { collectStyledKeyframeNames, convertStyledKeyframes } from "../keyframes.js";
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
  });
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

function buildDuplicateKeyframesNames(
  ctx: TransformContext,
  preservedNames: Set<string>,
): Map<string, string> {
  const duplicates = new Map<string, string>();
  if (preservedNames.size === 0) {
    return duplicates;
  }

  const usedNames = new Set<string>(ctx.keyframesNames);
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
    if (!removeStylexKeyframesDeclaration(ctx, alias)) {
      continue;
    }
    renameKeyframesAliasReferences(ctx, alias, name);
    changed = true;
  }
  return changed;
}

function removeStylexKeyframesDeclaration(ctx: TransformContext, localName: string): boolean {
  let removed = false;
  ctx.root
    .find(ctx.j.VariableDeclarator, { id: { type: "Identifier", name: localName } } as any)
    .forEach((path: any) => {
      const init = path.node.init;
      if (
        !init ||
        init.type !== "CallExpression" ||
        init.callee.type !== "MemberExpression" ||
        init.callee.object.type !== "Identifier" ||
        init.callee.object.name !== "stylex" ||
        init.callee.property.type !== "Identifier" ||
        init.callee.property.name !== "keyframes"
      ) {
        return;
      }

      const declaration = path.parentPath?.node;
      if (!declaration || declaration.type !== "VariableDeclaration") {
        return;
      }
      declaration.declarations = declaration.declarations.filter(
        (decl: unknown) => decl !== path.node,
      );
      removed = true;
    });
  return removed;
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
): void {
  ctx.root.find(ctx.j.Identifier, { name: fromName } as any).forEach((path: any) => {
    const parent = path.parentPath?.node;
    if (!parent || isNonReferenceIdentifier(path.node, parent)) {
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
  return parent.type === "Property" && parent.key === node && !parent.computed;
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
    const isStaticPropertyKey =
      parent?.type === "Property" && parent.key === node && !parent.computed;
    const alias = aliases.get(typed.name);
    if (alias && !isStaticPropertyKey) {
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

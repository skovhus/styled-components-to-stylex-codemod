/**
 * Step: hoist object/array literal values from object-form `.attrs({...})` to
 * stable module-scope consts.
 *
 * styled-components evaluates an object-form attrs argument once, at component
 * definition time, so object/array literals inside it keep a stable reference
 * across renders. Emitting them inline in the wrapper JSX (e.g.
 * `transition={{ duration: 0.2 }}`) would instead create a fresh reference on
 * every render, which breaks memoized children or effects keyed on those props.
 * To stay lossless we lift each such literal into a module-scope `const` and
 * reference it by name, mirroring styled-components' shared reference.
 *
 * Function-form attrs (`.attrs((props) => ({...}))`) are intentionally left
 * alone: styled-components re-invokes the callback on every render, so those
 * literals are already fresh per render and inlining them matches the original
 * semantics.
 *
 * This runs *before* `analyzeBeforeEmitStep` (which merges a base decl's attrs
 * into extending decls) so an inherited base literal is already rewritten to its
 * hoisted reference before the merge copies it into the extender — keeping the
 * stable reference even when the extender's own attrs are function-form.
 */
import { CONTINUE, returnResult, type StepResult } from "../transform-types.js";
import type { StyledDecl } from "../transform-types.js";
import type { TransformContext } from "../transform-context.js";

// Keys with dedicated downstream handling (inline style extraction, polymorphic
// `as`, stylex `sx` merging). Leave their values untouched.
const SKIP_ATTR_KEYS = new Set(["style", "sx", "as", "forwardedAs"]);

export function hoistAttrsObjectLiteralsStep(ctx: TransformContext): StepResult {
  const { j } = ctx;
  // Skip declarations partial migration is leaving unchanged: they keep their
  // original styled source, so hoisting would insert unused consts and the
  // multi-declarator bail must not fire for a component we are not rewriting.
  const decls = (ctx.styledDecls ?? []).filter((d) => !d.skipTransform) as StyledDecl[];
  const declsWithLiteralAttrs = decls.filter(hasReferenceLiteralAttr);
  if (declsWithLiteralAttrs.length === 0) {
    return CONTINUE;
  }

  // Declarations whose object/array attrs literal cannot be hoisted safely. We
  // bail (or, under partial migration, preserve just that declaration) rather
  // than degrade to inline: inline would drop styled-components' definition-time
  // reference identity and — for the blocked cases — also produces broken output.
  const blocked = declsWithLiteralAttrs
    .map((decl) => ({ decl, reason: hoistBlockReason(ctx, decl) }))
    .filter((entry): entry is { decl: StyledDecl; reason: BlockReason } => entry.reason !== null);
  if (blocked.length > 0) {
    for (const { decl, reason } of blocked) {
      ctx.warnings.push({ severity: "warning", type: reason, loc: decl.loc });
    }
    if (ctx.options.allowPartialMigration === true) {
      for (const { decl } of blocked) {
        decl.skipTransform = true;
      }
    } else {
      return returnResult({ code: null, warnings: ctx.warnings }, "bail");
    }
  }

  const reservedNames = collectReservedNames(ctx);
  const blockedDecls = new Set(blocked.map((entry) => entry.decl));

  for (const decl of declsWithLiteralAttrs) {
    const attrsInfo = decl.attrsInfo;
    if (blockedDecls.has(decl) || !attrsInfo || attrsInfo.sourceKind !== "object") {
      continue;
    }

    const hoisted: Array<{ name: string; key: string; valueNode: unknown }> = [];
    for (const [key, value] of Object.entries(attrsInfo.staticAttrs)) {
      if (SKIP_ATTR_KEYS.has(key) || !isReferenceLiteralNode(value)) {
        continue;
      }
      const name = uniqueName(`${decl.styleKey}${pascalCase(key)}`, reservedNames);
      reservedNames.add(name);
      hoisted.push({ name, key, valueNode: value });
      attrsInfo.staticAttrs[key] = j.identifier(name);
    }

    if (hoisted.length === 0) {
      continue;
    }

    const constDecls = hoisted.map(({ name, key, valueNode }) => {
      const id = j.identifier(name);
      // Annotate with the wrapped component's contextual prop type so the literal
      // is not widened away from a literal-union/tuple the target prop expects
      // (e.g. `{ type: "spring" }` or `[number, number]`).
      const typeAnnotation = buildAttrPropTypeAnnotation(ctx, decl, key);
      if (typeAnnotation) {
        (id as { typeAnnotation?: unknown }).typeAnnotation = typeAnnotation;
      }
      return j.variableDeclaration("const", [
        j.variableDeclarator(id, valueNode as Parameters<typeof j.variableDeclarator>[1]),
      ]);
    });
    insertBeforeStyledDecl(ctx, decl.localName, constDecls);
  }

  return CONTINUE;
}

/**
 * Builds a type annotation that pins the hoisted const to the wrapped
 * component's prop type, e.g. `React.ComponentPropsWithRef<typeof Base>["key"]`.
 * Without it, lifting a literal into an unannotated `const` widens it (e.g.
 * `{ type: "spring" }` → `{ type: string }`, `[0, 1]` → `number[]`), which can
 * fail TypeScript when the prop expects a literal union or tuple. Returns null
 * for JS output, polymorphic `as` overrides, or unresolvable bases.
 */
function buildAttrPropTypeAnnotation(
  ctx: TransformContext,
  decl: StyledDecl,
  key: string,
): unknown {
  const filePath = ctx.file.path;
  if (!filePath.endsWith(".ts") && !filePath.endsWith(".tsx")) {
    return null;
  }
  // With an `as` override the rendered component (and thus the prop type) differs
  // from the base, so skip rather than risk an incorrect annotation.
  if (decl.attrsInfo?.attrsAsTag) {
    return null;
  }
  // A local styled base is itself transformed by the codemod, and `styled(Local)`
  // chains are flattened at emit time to render the ultimate base directly. Resolve
  // through any local styled bases to that final rendered base: annotating against
  // `typeof LocalStyled` could dangle (the local base may be inlined away), while
  // dropping the annotation entirely would widen the literal (e.g. `ease: "easeIn"`
  // → `string`) and fail the type the final base expects. The final base's prop
  // type is what the hoisted value is actually passed to.
  const base = resolveFinalRenderedBase(ctx, decl.base);
  // If resolution still lands on a local styled component (e.g. a cyclic base),
  // `typeof Base` is not a safe target — skip the annotation.
  if (base.kind === "component" && isLocalStyledComponent(ctx, base.ident)) {
    return null;
  }
  const baseProps =
    base.kind === "component"
      ? `React.ComponentPropsWithRef<typeof ${base.ident}>`
      : base.kind === "intrinsic"
        ? `React.ComponentPropsWithRef<${JSON.stringify(base.tagName)}>`
        : null;
  if (!baseProps) {
    return null;
  }
  try {
    return ctx.j(`const _x: ${baseProps}[${JSON.stringify(key)}] = null`).get().node.program.body[0]
      .declarations[0].id.typeAnnotation;
  } catch {
    return null;
  }
}

type BlockReason =
  | "Unsupported .attrs() object/array value on a styled component sharing a multi-declarator statement"
  | "Unsupported .attrs() object/array value on a styled component whose name is shadowed in another scope";

/**
 * Returns why a literal-attrs declaration cannot be hoisted safely, else null.
 *
 * - Shadowed name: the const insertion (and the wrapper/callsite that references
 *   it) is located by name, so a same-named binding in another scope targets the
 *   wrong declaration. Only object-form attrs are blocked — they need the hoist
 *   for reference identity; function-form literals stay inline either way, which
 *   already matches styled-components.
 * - Multi-declarator statement (`const a = ..., X = styled(...)`): the wrapper
 *   emission replaces the whole declaration, dropping the sibling declarators,
 *   so a literal referencing a sibling would dangle.
 */
function hoistBlockReason(ctx: TransformContext, decl: StyledDecl): BlockReason | null {
  if (!hasSingleDeclaration(ctx, decl.localName)) {
    return decl.attrsInfo?.sourceKind === "object"
      ? "Unsupported .attrs() object/array value on a styled component whose name is shadowed in another scope"
      : null;
  }
  return multiDeclaratorStatementLoc(ctx, decl.localName) !== null
    ? "Unsupported .attrs() object/array value on a styled component sharing a multi-declarator statement"
    : null;
}

/** True when `name` is the local name of a styled component declared in this file. */
function isLocalStyledComponent(ctx: TransformContext, name: string): boolean {
  return (ctx.styledDecls ?? []).some((d) => d.localName === name);
}

/**
 * Walks a base through any local styled components to the final rendered base.
 * `styled(LocalStyled)` chains are flattened at emit time to render the ultimate
 * non-styled component or intrinsic directly, so an attrs literal on the leaf is
 * passed to that final base — its prop type is the correct annotation target.
 * Stops at the first non-local-styled base; guards against cyclic bases.
 */
function resolveFinalRenderedBase(
  ctx: TransformContext,
  base: StyledDecl["base"],
): StyledDecl["base"] {
  let current = base;
  const seen = new Set<string>();
  while (current.kind === "component" && isLocalStyledComponent(ctx, current.ident)) {
    const ident = current.ident;
    if (seen.has(ident)) {
      break;
    }
    seen.add(ident);
    const localBase = (ctx.styledDecls ?? []).find((d) => d.localName === ident)?.base;
    if (!localBase) {
      break;
    }
    current = localBase;
  }
  return current;
}

/** True when exactly one `VariableDeclaration` in the file declares `localName`. */
function hasSingleDeclaration(ctx: TransformContext, localName: string): boolean {
  const { j, root } = ctx;
  return (
    root
      .find(j.VariableDeclaration)
      .filter((path) =>
        path.node.declarations.some(
          (dcl) =>
            dcl.type === "VariableDeclarator" &&
            dcl.id?.type === "Identifier" &&
            dcl.id.name === localName,
        ),
      )
      .size() === 1
  );
}

/** True when any non-special attrs value is an object/array literal AST node. */
function hasReferenceLiteralAttr(decl: StyledDecl): boolean {
  const staticAttrs = decl.attrsInfo?.staticAttrs;
  if (!staticAttrs) {
    return false;
  }
  return Object.entries(staticAttrs).some(
    ([key, value]) => !SKIP_ATTR_KEYS.has(key) && isReferenceLiteralNode(value),
  );
}

/** True when `value` is an object/array literal AST node (optionally `as`-cast). */
function isReferenceLiteralNode(value: unknown): boolean {
  const node = unwrapTsWrappers(value);
  const type = (node as { type?: string } | undefined)?.type;
  return type === "ObjectExpression" || type === "ArrayExpression";
}

function unwrapTsWrappers(value: unknown): unknown {
  let node = value;
  while (
    node &&
    typeof node === "object" &&
    ((node as { type?: string }).type === "TSAsExpression" ||
      (node as { type?: string }).type === "TSSatisfiesExpression")
  ) {
    node = (node as { expression?: unknown }).expression;
  }
  return node;
}

/**
 * Returns the source location of the styled component's declaration statement
 * when it shares a `VariableDeclaration` with other declarators, else null.
 */
function multiDeclaratorStatementLoc(
  ctx: TransformContext,
  localName: string,
): { line: number; column: number } | null {
  const { j, root } = ctx;
  let result: { line: number; column: number } | null = null;
  root
    .find(j.VariableDeclaration)
    .filter((path) =>
      path.node.declarations.some(
        (dcl) =>
          dcl.type === "VariableDeclarator" &&
          dcl.id?.type === "Identifier" &&
          dcl.id.name === localName,
      ),
    )
    .forEach((path) => {
      if (result || path.node.declarations.length <= 1) {
        return;
      }
      const start = path.node.loc?.start;
      result = { line: start?.line ?? 0, column: start?.column ?? 0 };
    });
  return result;
}

/** Collect identifier names already present so generated consts never collide. */
function collectReservedNames(ctx: TransformContext): Set<string> {
  const { j, root } = ctx;
  const names = new Set<string>();
  root.find(j.Identifier).forEach((path) => {
    const name = (path.node as { name?: string }).name;
    if (typeof name === "string") {
      names.add(name);
    }
  });
  for (const decl of ctx.styledDecls ?? []) {
    names.add(decl.localName);
  }
  return names;
}

function pascalCase(key: string): string {
  return key
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join("");
}

function uniqueName(base: string, reserved: ReadonlySet<string>): string {
  let candidate = base.replace(/[^a-zA-Z0-9_$]/g, "");
  if (!candidate || /^[0-9]/.test(candidate)) {
    candidate = `attrs${candidate}`;
  }
  if (!reserved.has(candidate)) {
    return candidate;
  }
  let suffix = 2;
  while (reserved.has(`${candidate}${suffix}`)) {
    suffix++;
  }
  return `${candidate}${suffix}`;
}

function insertBeforeStyledDecl(
  ctx: TransformContext,
  localName: string,
  nodes: ReturnType<TransformContext["j"]["variableDeclaration"]>[],
): void {
  const { j, root } = ctx;
  const styledDecl = root
    .find(j.VariableDeclaration)
    .filter((path) =>
      path.node.declarations.some(
        (dcl) =>
          dcl.type === "VariableDeclarator" &&
          dcl.id?.type === "Identifier" &&
          dcl.id.name === localName,
      ),
    );
  if (styledDecl.size() === 0) {
    return;
  }
  const parent = styledDecl.paths()[0]?.parentPath;
  if (parent?.node?.type === "ExportNamedDeclaration") {
    j(parent).insertBefore(nodes);
  } else {
    styledDecl.at(0).insertBefore(nodes);
  }
}

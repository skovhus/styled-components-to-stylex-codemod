/**
 * Hoists object/array literal values from object-form `.attrs({...})` to stable
 * module-scope consts. Split across two pipeline steps to resolve a skip-ordering
 * cycle (see `transform.ts`):
 *
 *  - `markBlockedAttrsHoistsStep` runs *early* (before `lowerRulesStep`) and only
 *    decides which literal-attrs decls cannot be hoisted safely, marking them
 *    `skipTransform` (partial migration) or bailing (strict). Running early lets
 *    `lowerRulesStep`'s inlined-`css`-helper cleanup see those skips and not
 *    delete a helper a now-preserved decl still references.
 *  - `hoistAttrsObjectLiteralsStep` runs *later* (after every per-decl skip is
 *    final, e.g. `lowerRulesStep` skipping a decl for unsupported CSS) and does
 *    the actual const insertion + attrs rewrite. Deferring insertion avoids
 *    emitting an unused hoisted const for a declaration a later step preserves.
 *
 * Why hoist at all: styled-components evaluates an object-form attrs argument
 * once, at component definition time, so object/array literals inside it keep a
 * stable reference across renders. Emitting them inline in the wrapper JSX (e.g.
 * `transition={{ duration: 0.2 }}`) would create a fresh reference every render,
 * breaking memoized children or effects keyed on those props. Lifting each into a
 * module-scope `const` mirrors styled-components' shared reference.
 *
 * Function-form attrs (`.attrs((props) => ({...}))`) are intentionally left
 * alone: styled-components re-invokes the callback on every render, so those
 * literals are already fresh per render and inlining them matches the original
 * semantics.
 *
 * The insertion step still runs *before* `analyzeBeforeEmitStep` (which merges a
 * base decl's attrs into extending decls) so an inherited base literal is already
 * rewritten to its hoisted reference before the merge copies it into the extender.
 */
import { CONTINUE, returnResult, type StepResult } from "../transform-types.js";
import type { StyledDecl } from "../transform-types.js";
import type { TransformContext } from "../transform-context.js";

// Keys whose values have dedicated downstream handling and must not be hoisted:
// `style` (inline-style extraction) and `as`/`forwardedAs` (polymorphic element
// overrides — component references, never object/array literals). `sx` is
// intentionally NOT excluded: its object/array literals are forwarded into the
// rendered element / merged into the StyleX `sx` array, so they need the same
// definition-time reference identity as any other object-form attrs literal.
const SKIP_ATTR_KEYS = new Set(["style", "as", "forwardedAs"]);

/**
 * Early phase: mark (or bail on) declarations whose object/array attrs literal
 * cannot be hoisted safely, so later steps see those skips. Does no insertion.
 */
export function markBlockedAttrsHoistsStep(ctx: TransformContext): StepResult {
  const decls = (ctx.styledDecls ?? []).filter((d) => !d.skipTransform) as StyledDecl[];
  const blocked = decls
    .filter(hasReferenceLiteralAttr)
    .map((decl) => ({ decl, reason: hoistBlockReason(ctx, decl) }))
    .filter((entry): entry is { decl: StyledDecl; reason: BlockReason } => entry.reason !== null);
  if (blocked.length === 0) {
    return CONTINUE;
  }

  // Bail (or, under partial migration, preserve just that declaration) rather
  // than degrade to inline: inline would drop styled-components' definition-time
  // reference identity and — for the blocked cases — also produces broken output.
  for (const { decl, reason } of blocked) {
    ctx.warnings.push({ severity: "warning", type: reason, loc: decl.loc });
  }
  if (ctx.options.allowPartialMigration === true) {
    for (const { decl } of blocked) {
      decl.skipTransform = true;
    }
    return CONTINUE;
  }
  return returnResult({ code: null, warnings: ctx.warnings }, "bail");
}

/**
 * Insertion phase: lift each remaining object/array attrs literal into a
 * module-scope const and rewrite the attr to reference it. Runs after every
 * per-decl skip is final, so a declaration a later step preserved
 * (`skipTransform`) never gets an unused hoisted const.
 */
export function hoistAttrsObjectLiteralsStep(ctx: TransformContext): StepResult {
  const { j } = ctx;
  const decls = (ctx.styledDecls ?? []).filter((d) => !d.skipTransform) as StyledDecl[];
  const declsWithLiteralAttrs = decls.filter(hasReferenceLiteralAttr);
  if (declsWithLiteralAttrs.length === 0) {
    return CONTINUE;
  }

  const reservedNames = collectReservedNames(ctx);

  for (const decl of declsWithLiteralAttrs) {
    const attrsInfo = decl.attrsInfo;
    // Blocked decls were already marked `skipTransform` by the early phase, so
    // the `!d.skipTransform` filter above excludes them here.
    if (!attrsInfo || attrsInfo.sourceKind !== "object") {
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
 * Builds a type annotation that pins the hoisted const to the rendered
 * component's prop type, e.g. `React.ComponentPropsWithRef<typeof Base>["key"]`.
 * Without it, lifting a literal into an unannotated `const` widens it (e.g.
 * `{ type: "spring" }` → `{ type: string }`, `[0, 1]` → `number[]`), which can
 * fail TypeScript when the prop expects a literal union or tuple. Returns null
 * for JS output or unresolvable bases.
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
  // Non-identifier keys (e.g. `data-config`, `aria-*`) are JSX-only attributes that
  // a component's props type need not declare, so `Props["data-config"]` fails to
  // type-check even when `<div data-config={...} />` is valid. They also accept any
  // value, so there is no literal-widening to guard — skip the annotation.
  if (!/^[A-Za-z_$][\w$]*$/.test(key)) {
    return null;
  }
  // Resolve the component this decl actually renders, honoring polymorphic `as`
  // overrides (its own and any inherited from a local base) and flattened
  // `styled(Local)` chains. The hoisted value is passed to that rendered
  // component, so its prop type is the correct annotation target — annotating
  // against the raw `base` would dangle (a local base may be inlined away) or be
  // wrong (an `as` override renders something else), while dropping the
  // annotation entirely would widen the literal.
  const base = resolveRenderedBase(ctx, decl);
  if (!base) {
    return null;
  }
  const baseProps =
    base.kind === "component"
      ? `React.ComponentPropsWithRef<typeof ${base.ident}>`
      : `React.ComponentPropsWithRef<${JSON.stringify(base.tagName)}>`;
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
 * Resolves the component a decl actually renders, for typing a hoisted attrs
 * literal. Two distinct emit behaviors must be mirrored:
 *
 *  - `styled(LocalStyled)` *bases* are flattened away at emit time — the wrapper
 *    renders the local base's ultimate non-styled component or intrinsic directly —
 *    so walk through a local styled base to its leaf.
 *  - A polymorphic `as` override (`attrsAsTag`, the decl's own or one inherited from
 *    a local base) is rendered *directly* (`propsTarget = attrsAsTag ?? base`); the
 *    wrapper emits `<asTarget>` without flattening it. So an `as` target is the
 *    rendered component as-is — type against it even when it is itself a local
 *    styled component (flattening it would type against a different prop surface).
 *
 * Returns null when the chain is cyclic or a base decl is missing.
 */
function resolveRenderedBase(ctx: TransformContext, decl: StyledDecl): StyledDecl["base"] | null {
  const seen = new Set<string>([decl.localName]);
  let current: StyledDecl = decl;
  for (;;) {
    // An `as` override is rendered directly, so it is the rendered component — stop
    // here rather than flattening through it.
    const asTag = current.attrsInfo?.attrsAsTag;
    if (asTag) {
      return { kind: "component", ident: asTag };
    }
    const base = current.base;
    // An intrinsic or a non-local (imported) component is rendered as-is.
    if (base.kind !== "component" || !isLocalStyledComponent(ctx, base.ident)) {
      return base;
    }
    // A local styled base is flattened away, so continue to its own rendered base.
    if (seen.has(base.ident)) {
      return null;
    }
    seen.add(base.ident);
    const baseDecl = (ctx.styledDecls ?? []).find((d) => d.localName === base.ident);
    if (!baseDecl) {
      return null;
    }
    current = baseDecl;
  }
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

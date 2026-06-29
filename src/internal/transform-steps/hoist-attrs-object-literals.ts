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

  // A styled component sharing a multi-declarator statement (`const a = ..., X =
  // styled(...)`) becomes a wrapper whose emission replaces the whole declaration,
  // dropping the sibling declarators. A preserved object/array attrs literal (and
  // any sibling it references) can no longer be represented safely there, so bail
  // the file rather than emit a dangling reference.
  for (const decl of declsWithLiteralAttrs) {
    const loc = multiDeclaratorStatementLoc(ctx, decl.localName);
    if (loc) {
      ctx.warnings.push({
        severity: "warning",
        type: "Unsupported .attrs() object/array value on a styled component sharing a multi-declarator statement",
        loc,
      });
      return returnResult({ code: null, warnings: ctx.warnings }, "bail");
    }
  }

  const reservedNames = collectReservedNames(ctx);

  for (const decl of decls) {
    const attrsInfo = decl.attrsInfo;
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
  const base = decl.base;
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

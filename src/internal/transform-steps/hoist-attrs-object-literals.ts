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
 */
import { CONTINUE, type StepResult } from "../transform-types.js";
import type { StyledDecl } from "../transform-types.js";
import type { TransformContext } from "../transform-context.js";

// Keys with dedicated downstream handling (inline style extraction, polymorphic
// `as`, stylex `sx` merging). Leave their values untouched.
const SKIP_ATTR_KEYS = new Set(["style", "sx", "as", "forwardedAs"]);

export function hoistAttrsObjectLiteralsStep(ctx: TransformContext): StepResult {
  const { j } = ctx;
  const decls = (ctx.styledDecls ?? []) as StyledDecl[];
  if (!decls.some((d) => d.attrsInfo?.sourceKind === "object")) {
    return CONTINUE;
  }

  const reservedNames = collectReservedNames(ctx);

  for (const decl of decls) {
    const attrsInfo = decl.attrsInfo;
    if (!attrsInfo || attrsInfo.sourceKind !== "object") {
      continue;
    }

    const hoisted: Array<{ name: string; valueNode: unknown }> = [];
    for (const [key, value] of Object.entries(attrsInfo.staticAttrs)) {
      if (SKIP_ATTR_KEYS.has(key) || !isReferenceLiteralNode(value)) {
        continue;
      }
      const name = uniqueName(`${decl.styleKey}${pascalCase(key)}`, reservedNames);
      reservedNames.add(name);
      hoisted.push({ name, valueNode: value });
      attrsInfo.staticAttrs[key] = j.identifier(name);
    }

    if (hoisted.length === 0) {
      continue;
    }

    const constDecls = hoisted.map(({ name, valueNode }) =>
      j.variableDeclaration("const", [
        j.variableDeclarator(
          j.identifier(name),
          valueNode as Parameters<typeof j.variableDeclarator>[1],
        ),
      ]),
    );
    insertBeforeStyledDecl(ctx, decl.localName, constDecls);
  }

  return CONTINUE;
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

/**
 * Decides whether a `styled(Component)` wraps a component that already
 * accepts a StyleX `sx` prop. When true, the codemod emits `sx={style}`
 * instead of `{...stylex.props(style)}` on the wrapped element.
 *
 * Two signals are consulted, in order:
 *   1. The adapter `wrappedComponentInterface` hook — explicit override.
 *   2. Static auto-detection of an `sx?: …` member on the imported
 *      component's props type, or on a same-file component's props type when
 *      the current source is provided.
 *
 * Used by both the wrapper-emitter (full wrapper components) and the
 * JSX-rewrite step (inlined re-styles).
 */
import { existsSync, readFileSync } from "node:fs";
import jscodeshift, { type ASTNode, type JSCodeshift } from "jscodeshift";
import type { Adapter, ImportSource } from "../adapter.js";
import { createModuleResolver } from "./prepass/resolve-imports.js";
import { toRealPath } from "./utilities/path-utils.js";

export function isWrappedComponentSxAware(args: {
  adapter: Pick<Adapter, "useSxProp" | "wrappedComponentInterface">;
  importMap: ReadonlyMap<string, { importedName: string; source: ImportSource }> | undefined;
  componentLocalName: string;
  filePath: string;
  localSource?: string;
  sourceOverrides?: ReadonlyMap<string, string>;
}): boolean {
  const { adapter, importMap, componentLocalName, filePath, localSource, sourceOverrides } = args;
  if (!adapter.useSxProp) {
    return false;
  }

  const importInfo = importMap?.get(componentLocalName);
  if (!importInfo) {
    const source = readSourceOverride(filePath, sourceOverrides) ?? localSource;
    return source
      ? computeDetectionFromSource(source, componentLocalName, filePath, sourceOverrides)
      : false;
  }

  // 1) Adapter override always wins when it returns a value.
  const adapterResult = adapter.wrappedComponentInterface?.({
    localName: componentLocalName,
    importSource: importInfo.source.value,
    importedName: importInfo.importedName,
    filePath,
  });
  if (adapterResult !== undefined) {
    return adapterResult.acceptsSx === true;
  }

  // 2) Static auto-detection: resolve the imported component to source on disk
  //    and scan its declared props type.
  const absolutePath = resolveWrappedComponentSource(importInfo.source, filePath);
  if (!absolutePath) {
    return false;
  }
  return detectExportedSxProp(absolutePath, importInfo.importedName, sourceOverrides);
}

// ────────────────────────────────────────────────────────────────────────────
// Auto-detection: check whether `componentName` declares an `sx?` member on
// its props type.
// ────────────────────────────────────────────────────────────────────────────

const FILE_EXTENSIONS = ["", ".tsx", ".ts", ".jsx", ".js"];
const SX_PROP_NAME = "sx";
const moduleResolver = createModuleResolver();

/**
 * Cache keyed by `absolutePath\u0000componentName`. Detection requires reading
 * and parsing the source file, so memoize across the many `styled(X)` lookups
 * that happen during a single transform pass.
 */
const detectionCache = new Map<string, boolean>();

function resolveWrappedComponentSource(source: ImportSource, filePath: string): string | null {
  if (source.kind === "absolutePath") {
    return source.value;
  }
  return moduleResolver.resolve(filePath, source.value) ?? null;
}

function detectExportedSxProp(
  absolutePath: string,
  componentName: string,
  sourceOverrides?: ReadonlyMap<string, string>,
): boolean {
  const sourceOverride = readSourceOverride(absolutePath, sourceOverrides);
  if (sourceOverride !== undefined) {
    const sourcePath = resolveSourcePath(absolutePath) ?? absolutePath;
    return computeDetectionFromSource(sourceOverride, componentName, sourcePath, sourceOverrides);
  }

  const cacheKey = `${absolutePath}\u0000${componentName}`;
  const cached = detectionCache.get(cacheKey);
  if (cached !== undefined) {
    return cached;
  }
  const result = computeDetection(absolutePath, componentName);
  detectionCache.set(cacheKey, result);
  return result;
}

function computeDetection(absolutePath: string, componentName: string): boolean {
  const resolved = resolveSourcePath(absolutePath);
  if (!resolved) {
    return false;
  }

  let source: string;
  try {
    source = readFileSync(resolved, "utf8");
  } catch {
    return false;
  }

  return computeDetectionFromSource(source, componentName, resolved);
}

function computeDetectionFromSource(
  source: string,
  componentName: string,
  filePath?: string,
  sourceOverrides?: ReadonlyMap<string, string>,
): boolean {
  // Cheap pre-check: if the file doesn't even mention `sx` near the named
  // component, skip parsing entirely. This keeps the common no-match case fast.
  if (!source.includes(componentName)) {
    return false;
  }

  const parsed = parseSource(source);
  if (!parsed) {
    return false;
  }
  const { j, root } = parsed;

  const propsTypeNode = findComponentPropsType(root, componentName);
  if (!propsTypeNode) {
    return false;
  }
  return typeMentionsSxMember(
    {
      j,
      root,
      filePath,
      sourceOverrides,
      visitedTypeNames: new Set(),
    },
    propsTypeNode,
  );
}

function parseSource(source: string): { j: JSCodeshift; root: ReturnType<JSCodeshift> } | null {
  // Always parse with the tsx parser — it's a superset that handles plain JS,
  // JSX, TS and TSX. Misparses on truly novel syntax simply return false.
  try {
    const j = jscodeshift.withParser("tsx");
    return { j, root: j(source) };
  } catch {
    return null;
  }
}

function resolveSourcePath(absolutePath: string): string | null {
  for (const candidate of sourcePathCandidates(absolutePath)) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }
  return null;
}

function readSourceOverride(
  absolutePath: string,
  sourceOverrides: ReadonlyMap<string, string> | undefined,
): string | undefined {
  if (!sourceOverrides) {
    return undefined;
  }

  for (const candidate of sourcePathCandidates(absolutePath)) {
    const source = sourceOverrides.get(toRealPath(candidate));
    if (source !== undefined) {
      return source;
    }
  }
  return undefined;
}

function sourcePathCandidates(absolutePath: string): string[] {
  return FILE_EXTENSIONS.map((ext) => absolutePath + ext);
}

/**
 * Locate a top-level `componentName` declaration in `root` and return the TS
 * type annotation of its first parameter, or null.
 *
 * Handles:
 *   - `export function Name(props: T)` and `export default function Name(...)`.
 *   - `export const Name = (props: T) => …` / arrow function variants.
 */
function findComponentPropsType(
  root: ReturnType<JSCodeshift>,
  componentName: string,
): ASTNode | null {
  let propsType: ASTNode | null = null;

  const recordFromParam = (params: unknown): void => {
    if (propsType || !Array.isArray(params) || params.length === 0) {
      return;
    }
    const first = params[0] as { typeAnnotation?: { typeAnnotation?: ASTNode } } | null;
    const ann = first?.typeAnnotation?.typeAnnotation;
    if (ann) {
      propsType = ann;
    }
  };

  const body = root.get().node.program.body;
  for (const statement of body) {
    const declaration =
      statement.type === "ExportNamedDeclaration" || statement.type === "ExportDefaultDeclaration"
        ? statement.declaration
        : statement;
    if (!declaration) {
      continue;
    }
    if (declaration.type === "FunctionDeclaration") {
      const id = declaration.id as { name?: string } | null | undefined;
      if (id?.name === componentName) {
        recordFromParam(declaration.params);
      }
      continue;
    }
    if (declaration.type !== "VariableDeclaration") {
      continue;
    }
    for (const declarator of declaration.declarations) {
      const id = declarator.id as { type?: string; name?: string };
      if (id.type !== "Identifier" || id.name !== componentName) {
        continue;
      }
      const init = declarator.init as { type?: string; params?: unknown } | null | undefined;
      if (init && (init.type === "ArrowFunctionExpression" || init.type === "FunctionExpression")) {
        recordFromParam(init.params);
      }
    }
  }

  return propsType;
}

/**
 * Walk a TS type AST node and return true iff any reachable member is
 * named `sx`. Resolves type references against same-file
 * `TSTypeAliasDeclaration` / `TSInterfaceDeclaration` declarations.
 *
 * Opaque utility types like `Omit`/`Pick`/`Partial`/`React.ComponentProps`
 * are skipped (we can't peek inside their structural result), which is fine:
 * the convention places `sx` on a sibling literal in the intersection.
 */
interface TypeWalkContext {
  j: JSCodeshift;
  root: ReturnType<JSCodeshift>;
  visitedTypeNames: Set<string>;
  filePath?: string;
  sourceOverrides?: ReadonlyMap<string, string>;
}

function typeMentionsSxMember(ctx: TypeWalkContext, node: ASTNode): boolean {
  type WalkNode = ASTNode & {
    type?: string;
    members?: unknown[];
    types?: unknown[];
    typeName?: { type?: string; name?: string };
    typeAnnotation?: ASTNode;
    body?: { body?: unknown[] };
  };
  const n = node as WalkNode;
  switch (n.type) {
    case "TSTypeLiteral":
      return literalContainsSxMember(n.members);
    case "TSIntersectionType":
    case "TSUnionType":
      for (const member of n.types ?? []) {
        if (typeMentionsSxMember(ctx, member as ASTNode)) {
          return true;
        }
      }
      return false;
    case "TSParenthesizedType":
      return n.typeAnnotation ? typeMentionsSxMember(ctx, n.typeAnnotation) : false;
    case "TSTypeReference": {
      const typeName = n.typeName?.name;
      return typeName ? typeReferenceMentionsSx(ctx, typeName, { allowImported: false }) : false;
    }
    default:
      return false;
  }
}

function typeReferenceMentionsSx(
  ctx: TypeWalkContext,
  typeName: string,
  options: { allowImported: boolean },
): boolean {
  const visitedKey = `${ctx.filePath ?? "<memory>"}\u0000${typeName}`;
  if (ctx.visitedTypeNames.has(visitedKey)) {
    return false;
  }
  ctx.visitedTypeNames.add(visitedKey);

  const aliased = ctx.root.find(ctx.j.TSTypeAliasDeclaration).filter((p) => {
    const id = (p.node as { id?: { name?: string } }).id;
    return id?.name === typeName;
  });
  if (aliased.size() > 0) {
    const annotation = (aliased.get().node as { typeAnnotation?: ASTNode }).typeAnnotation;
    if (annotation && typeMentionsSxMember(ctx, annotation)) {
      return true;
    }
  }

  const iface = ctx.root.find(ctx.j.TSInterfaceDeclaration).filter((p) => {
    const id = (p.node as { id?: { name?: string } }).id;
    return id?.name === typeName;
  });
  if (iface.size() > 0) {
    const node = iface.get().node as {
      body?: { body?: unknown[] };
      extends?: unknown[];
    };
    if (literalContainsSxMember(node.body?.body)) {
      return true;
    }
    if (interfaceExtendsMentionSx(ctx, node.extends)) {
      return true;
    }
  }

  return options.allowImported ? importedTypeReferenceMentionsSx(ctx, typeName) : false;
}

function interfaceExtendsMentionSx(ctx: TypeWalkContext, heritage: unknown[] | undefined): boolean {
  if (!Array.isArray(heritage)) {
    return false;
  }
  for (const item of heritage) {
    const typeName = getHeritageTypeName(item);
    if (typeName && typeReferenceMentionsSx(ctx, typeName, { allowImported: true })) {
      return true;
    }
  }
  return false;
}

function getHeritageTypeName(node: unknown): string | null {
  if (!node || typeof node !== "object") {
    return null;
  }
  const n = node as {
    expression?: { type?: string; name?: string };
    typeName?: { type?: string; name?: string };
  };
  if (n.expression?.type === "Identifier") {
    return n.expression.name ?? null;
  }
  if (n.typeName?.type === "Identifier") {
    return n.typeName.name ?? null;
  }
  return null;
}

function importedTypeReferenceMentionsSx(ctx: TypeWalkContext, localTypeName: string): boolean {
  const importInfo = findTypeImport(ctx.root, localTypeName);
  if (!importInfo || !ctx.filePath) {
    return false;
  }
  const resolvedPath = moduleResolver.resolve(ctx.filePath, importInfo.source);
  if (!resolvedPath) {
    return false;
  }
  const source = readSourceOverride(resolvedPath, ctx.sourceOverrides) ?? readSource(resolvedPath);
  if (!source) {
    return false;
  }
  const parsed = parseSource(source);
  if (!parsed) {
    return false;
  }
  return typeReferenceMentionsSx(
    {
      ...ctx,
      j: parsed.j,
      root: parsed.root,
      filePath: resolvedPath,
    },
    importInfo.importedName,
    { allowImported: true },
  );
}

function findTypeImport(
  root: ReturnType<JSCodeshift>,
  localTypeName: string,
): { importedName: string; source: string } | null {
  const body = root.get().node.program.body;
  for (const statement of body) {
    if (statement.type !== "ImportDeclaration") {
      continue;
    }
    const source = (statement.source as { value?: unknown }).value;
    if (typeof source !== "string") {
      continue;
    }
    for (const specifier of statement.specifiers ?? []) {
      const spec = specifier as {
        type?: string;
        local?: { name?: string };
        imported?: { name?: string; value?: unknown };
      };
      if (spec.local?.name !== localTypeName) {
        continue;
      }
      if (spec.type === "ImportSpecifier") {
        const importedName =
          spec.imported?.name ??
          (typeof spec.imported?.value === "string" ? spec.imported.value : undefined);
        return importedName ? { importedName, source } : null;
      }
      if (spec.type === "ImportDefaultSpecifier") {
        return { importedName: "default", source };
      }
    }
  }
  return null;
}

function readSource(absolutePath: string): string | null {
  const resolved = resolveSourcePath(absolutePath);
  if (!resolved) {
    return null;
  }
  try {
    return readFileSync(resolved, "utf8");
  } catch {
    return null;
  }
}

function literalContainsSxMember(members: unknown): boolean {
  if (!Array.isArray(members)) {
    return false;
  }
  for (const member of members) {
    const m = member as {
      type?: string;
      key?: { type?: string; name?: string; value?: unknown };
    } | null;
    if (m?.type !== "TSPropertySignature" || !m.key) {
      continue;
    }
    const name =
      m.key.type === "Identifier"
        ? m.key.name
        : (m.key.type === "StringLiteral" || m.key.type === "Literal") &&
            typeof m.key.value === "string"
          ? m.key.value
          : null;
    if (name === SX_PROP_NAME) {
      return true;
    }
  }
  return false;
}

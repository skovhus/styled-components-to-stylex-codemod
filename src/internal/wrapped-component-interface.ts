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

export function detectExportedComponentSxProp(args: {
  absolutePath: string;
  componentName: string;
  sourceOverrides?: ReadonlyMap<string, string>;
  visited?: Set<string>;
}): boolean {
  return detectExportedSxProp(
    args.absolutePath,
    args.componentName,
    args.sourceOverrides,
    args.visited ?? new Set(),
  );
}

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
  return detectExportedComponentSxProp({
    absolutePath,
    componentName: importInfo.importedName,
    sourceOverrides,
  });
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
  visited = new Set<string>(),
): boolean {
  const sourcePath = resolveSourcePath(absolutePath) ?? absolutePath;
  const visitKey = `${toRealPath(sourcePath)}\u0000${componentName}`;
  if (visited.has(visitKey)) {
    return false;
  }
  visited.add(visitKey);
  const sourceOverride = readSourceOverride(absolutePath, sourceOverrides);
  if (sourceOverride !== undefined) {
    return computeDetectionFromSource(
      sourceOverride,
      componentName,
      sourcePath,
      sourceOverrides,
      visited,
    );
  }

  const cacheKey = `${absolutePath}\u0000${componentName}`;
  if (!sourceOverrides) {
    const cached = detectionCache.get(cacheKey);
    if (cached !== undefined) {
      return cached;
    }
  }
  const result = computeDetection(absolutePath, componentName, visited, sourceOverrides);
  if (!sourceOverrides) {
    detectionCache.set(cacheKey, result);
  }
  return result;
}

function computeDetection(
  absolutePath: string,
  componentName: string,
  visited: Set<string>,
  sourceOverrides?: ReadonlyMap<string, string>,
): boolean {
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

  return computeDetectionFromSource(source, componentName, resolved, sourceOverrides, visited);
}

function computeDetectionFromSource(
  source: string,
  componentName: string,
  filePath?: string,
  sourceOverrides?: ReadonlyMap<string, string>,
  visited = new Set<string>(),
): boolean {
  // Cheap pre-check: if the file doesn't even mention the named component and
  // is not a barrel that could forward it, skip parsing the common no-match case.
  if (!source.includes(componentName) && !sourceHasReExports(source)) {
    return false;
  }
  const parsed = parseSource(source);
  if (!parsed) {
    return false;
  }
  const { j, root } = parsed;

  const propsTypeNode = findComponentPropsType(root, componentName);
  if (!propsTypeNode) {
    return filePath
      ? detectReExportedSxProp(root, componentName, filePath, sourceOverrides, visited)
      : false;
  }
  return typeMentionsSxMember(
    {
      j,
      root,
      filePath,
      sourceOverrides,
      visited,
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

function isKnownPropPreservingHocCallee(callee: unknown): boolean {
  const node = callee as
    | {
        type?: string;
        name?: string;
        property?: { type?: string; name?: string };
      }
    | null
    | undefined;
  if (!node) {
    return false;
  }
  if (node.type === "Identifier") {
    return node.name === "memo" || node.name === "forwardRef";
  }
  return (
    node.type === "MemberExpression" &&
    node.property?.type === "Identifier" &&
    (node.property.name === "memo" || node.property.name === "forwardRef")
  );
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
  const recordFromInit = (init: unknown): void => {
    if (propsType || !init || typeof init !== "object") {
      return;
    }
    const node = init as {
      type?: string;
      params?: unknown;
      arguments?: unknown[];
      callee?: unknown;
    };
    if (node.type === "ArrowFunctionExpression" || node.type === "FunctionExpression") {
      recordFromParam(node.params);
      return;
    }
    if (node.type !== "CallExpression" || !Array.isArray(node.arguments)) {
      return;
    }
    const canFollowIdentifierArguments = isKnownPropPreservingHocCallee(node.callee);
    for (const arg of node.arguments) {
      const argNode = arg as { type?: string; name?: string };
      if (canFollowIdentifierArguments && argNode.type === "Identifier" && argNode.name) {
        recordFromNamedDeclaration(argNode.name);
        if (propsType) {
          return;
        }
        continue;
      }
      recordFromInit(arg);
      if (propsType) {
        return;
      }
    }
  };

  const recordFromNamedDeclaration = (name: string): void => {
    if (propsType) {
      return;
    }
    const body = root.get().node.program.body;
    for (const statement of body) {
      const declaration =
        statement.type === "ExportNamedDeclaration" ? statement.declaration : statement;
      if (!declaration) {
        continue;
      }
      if (declaration.type === "FunctionDeclaration") {
        const id = declaration.id as { name?: string } | null | undefined;
        if (id?.name === name) {
          recordFromParam(declaration.params);
          return;
        }
        continue;
      }
      if (declaration.type !== "VariableDeclaration") {
        continue;
      }
      for (const declarator of declaration.declarations) {
        const id = declarator.id as { type?: string; name?: string };
        if (id.type === "Identifier" && id.name === name) {
          recordFromInit(declarator.init);
          return;
        }
      }
    }
  };

  if (componentName === "default") {
    const body = root.get().node.program.body;
    for (const statement of body) {
      if (statement.type !== "ExportDefaultDeclaration") {
        continue;
      }
      const declaration = statement.declaration as
        | { type?: string; params?: unknown; name?: string }
        | null
        | undefined;
      if (!declaration) {
        continue;
      }
      if (
        declaration.type === "FunctionDeclaration" ||
        declaration.type === "FunctionExpression" ||
        declaration.type === "ArrowFunctionExpression"
      ) {
        recordFromParam(declaration.params);
        return propsType;
      }
      if (declaration.type === "Identifier" && declaration.name) {
        recordFromNamedDeclaration(declaration.name);
        return propsType;
      }
      recordFromInit(declaration);
      return propsType;
    }
    return null;
  }

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
      recordFromInit(declarator.init);
    }
  }

  return propsType;
}

function detectReExportedSxProp(
  root: ReturnType<JSCodeshift>,
  componentName: string,
  filePath: string,
  sourceOverrides?: ReadonlyMap<string, string>,
  visited?: Set<string>,
): boolean {
  const body = root.get().node.program.body;
  for (const statement of body) {
    if (statement.type !== "ExportNamedDeclaration" && statement.type !== "ExportAllDeclaration") {
      continue;
    }
    const source = (statement.source as { value?: unknown } | null | undefined)?.value;
    if (typeof source !== "string") {
      continue;
    }
    let sourceComponentName = componentName;
    if (statement.type === "ExportNamedDeclaration") {
      let forwardedName: string | null = null;
      for (const specifier of statement.specifiers ?? []) {
        const spec = specifier as {
          type?: string;
          local?: { type?: string; name?: string; value?: unknown };
          exported?: { type?: string; name?: string; value?: unknown };
        };
        if (spec.type !== "ExportSpecifier") {
          continue;
        }
        const exportedName = getModuleName(spec.exported);
        if (exportedName !== componentName) {
          continue;
        }
        forwardedName = getModuleName(spec.local) ?? exportedName;
        break;
      }
      if (!forwardedName) {
        continue;
      }
      sourceComponentName = forwardedName;
    }
    const resolvedPath = moduleResolver.resolve(filePath, source);
    if (
      resolvedPath &&
      detectExportedComponentSxProp({
        absolutePath: resolvedPath,
        componentName: sourceComponentName,
        sourceOverrides,
        visited,
      })
    ) {
      return true;
    }
  }
  return false;
}

function sourceHasReExports(source: string): boolean {
  return /\bexport\s+(?:\*|\{)/.test(source);
}

function getModuleName(node: unknown): string | null {
  const n = node as { type?: string; name?: string; value?: unknown } | null | undefined;
  if (!n) {
    return null;
  }
  if (n.type === "Identifier") {
    return n.name ?? null;
  }
  return typeof n.value === "string" ? n.value : null;
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
  visited?: Set<string>;
  filePath?: string;
  sourceOverrides?: ReadonlyMap<string, string>;
}

function typeMentionsSxMember(ctx: TypeWalkContext, node: ASTNode): boolean {
  type WalkNode = ASTNode & {
    type?: string;
    members?: unknown[];
    types?: unknown[];
    typeName?: TypeReferenceNameNode;
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
      const typeName = getTypeReferenceName(n.typeName);
      return typeName ? typeReferenceNameMentionsSx(ctx, typeName, { allowImported: true }) : false;
    }
    default:
      return false;
  }
}

type TypeReferenceName =
  | { kind: "identifier"; name: string }
  | { kind: "qualified"; namespace: string; name: string };

type TypeReferenceNameNode =
  | { type?: "Identifier"; name?: string }
  | {
      type?: "TSQualifiedName";
      left?: TypeReferenceNameNode;
      right?: TypeReferenceNameNode;
    };

function getTypeReferenceName(
  typeName: TypeReferenceNameNode | undefined,
): TypeReferenceName | null {
  if (typeName?.type === "Identifier" && typeName.name) {
    return { kind: "identifier", name: typeName.name };
  }
  if (
    typeName?.type === "TSQualifiedName" &&
    typeName.left?.type === "Identifier" &&
    typeName.left.name &&
    typeName.right?.type === "Identifier" &&
    typeName.right.name
  ) {
    return { kind: "qualified", namespace: typeName.left.name, name: typeName.right.name };
  }
  return null;
}

function typeReferenceNameMentionsSx(
  ctx: TypeWalkContext,
  typeName: TypeReferenceName,
  options: { allowImported: boolean },
): boolean {
  if (typeName.kind === "qualified") {
    return options.allowImported ? importedNamespaceTypeReferenceMentionsSx(ctx, typeName) : false;
  }
  return typeReferenceMentionsSx(ctx, typeName.name, options);
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

  if (typeName === "default" && defaultExportedTypeDeclarationMentionsSx(ctx)) {
    return true;
  }
  if (exportedTypeReferenceMentionsSx(ctx, typeName)) {
    return true;
  }
  return options.allowImported ? importedTypeReferenceMentionsSx(ctx, typeName) : false;
}

function defaultExportedTypeDeclarationMentionsSx(ctx: TypeWalkContext): boolean {
  const body = ctx.root.get().node.program.body;
  for (const statement of body) {
    if (statement.type !== "ExportDefaultDeclaration") {
      continue;
    }
    const declaration = statement.declaration as
      | {
          type?: string;
          name?: string;
          body?: { body?: unknown[] };
          extends?: unknown[];
          typeAnnotation?: ASTNode;
        }
      | null
      | undefined;
    if (!declaration) {
      continue;
    }
    if (declaration.type === "TSInterfaceDeclaration") {
      return (
        literalContainsSxMember(declaration.body?.body) ||
        interfaceExtendsMentionSx(ctx, declaration.extends)
      );
    }
    if (declaration.type === "TSTypeAliasDeclaration" && declaration.typeAnnotation) {
      return typeMentionsSxMember(ctx, declaration.typeAnnotation);
    }
    if (declaration.type === "Identifier" && typeof declaration.name === "string") {
      return typeReferenceMentionsSx(ctx, declaration.name, { allowImported: true });
    }
  }
  return false;
}

function exportedTypeReferenceMentionsSx(ctx: TypeWalkContext, typeName: string): boolean {
  if (!ctx.filePath) {
    return false;
  }
  const body = ctx.root.get().node.program.body;
  for (const statement of body) {
    if (statement.type === "ExportAllDeclaration") {
      const source = (statement.source as { value?: unknown } | null | undefined)?.value;
      if (typeof source !== "string") {
        continue;
      }
      const resolvedPath = moduleResolver.resolve(ctx.filePath, source);
      if (!resolvedPath) {
        continue;
      }
      const sourceText =
        readSourceOverride(resolvedPath, ctx.sourceOverrides) ?? readSource(resolvedPath);
      if (!sourceText) {
        continue;
      }
      const parsed = parseSource(sourceText);
      if (!parsed) {
        continue;
      }
      if (
        typeReferenceMentionsSx(
          {
            ...ctx,
            j: parsed.j,
            root: parsed.root,
            filePath: resolvedPath,
          },
          typeName,
          { allowImported: true },
        )
      ) {
        return true;
      }
      continue;
    }
    if (statement.type !== "ExportNamedDeclaration") {
      continue;
    }
    const source = (statement.source as { value?: unknown } | null | undefined)?.value;
    for (const specifier of statement.specifiers ?? []) {
      const spec = specifier as {
        type?: string;
        local?: { type?: string; name?: string; value?: unknown };
        exported?: { type?: string; name?: string; value?: unknown };
      };
      if (spec.type !== "ExportSpecifier" && spec.type !== "ExportTypeSpecifier") {
        continue;
      }
      const exportedName = getModuleName(spec.exported);
      if (exportedName !== typeName) {
        continue;
      }
      const sourceName = getModuleName(spec.local) ?? exportedName;
      if (typeof source !== "string") {
        if (typeReferenceMentionsSx(ctx, sourceName, { allowImported: true })) {
          return true;
        }
        continue;
      }
      const resolvedPath = moduleResolver.resolve(ctx.filePath, source);
      if (!resolvedPath) {
        continue;
      }
      const sourceText =
        readSourceOverride(resolvedPath, ctx.sourceOverrides) ?? readSource(resolvedPath);
      if (!sourceText) {
        continue;
      }
      const parsed = parseSource(sourceText);
      if (!parsed) {
        continue;
      }
      if (
        typeReferenceMentionsSx(
          {
            ...ctx,
            j: parsed.j,
            root: parsed.root,
            filePath: resolvedPath,
          },
          sourceName,
          { allowImported: true },
        )
      ) {
        return true;
      }
    }
  }
  return false;
}

function interfaceExtendsMentionSx(ctx: TypeWalkContext, heritage: unknown[] | undefined): boolean {
  if (!Array.isArray(heritage)) {
    return false;
  }
  for (const item of heritage) {
    const typeName = getHeritageTypeName(item);
    if (typeName && typeReferenceNameMentionsSx(ctx, typeName, { allowImported: true })) {
      return true;
    }
  }
  return false;
}

function getHeritageTypeName(node: unknown): TypeReferenceName | null {
  if (!node || typeof node !== "object") {
    return null;
  }
  const n = node as {
    expression?: TypeReferenceNameNode;
    typeName?: TypeReferenceNameNode;
  };
  return getTypeReferenceName(n.expression) ?? getTypeReferenceName(n.typeName);
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

function importedNamespaceTypeReferenceMentionsSx(
  ctx: TypeWalkContext,
  typeName: Extract<TypeReferenceName, { kind: "qualified" }>,
): boolean {
  const importInfo = findNamespaceTypeImport(ctx.root, typeName.namespace);
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
    typeName.name,
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

function findNamespaceTypeImport(
  root: ReturnType<JSCodeshift>,
  localNamespace: string,
): { source: string } | null {
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
      const spec = specifier as { type?: string; local?: { name?: string } };
      if (spec.type === "ImportNamespaceSpecifier" && spec.local?.name === localNamespace) {
        return { source };
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

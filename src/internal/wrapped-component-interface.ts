/**
 * Decides whether a `styled(Component)` wraps a component that already
 * accepts a StyleX `sx` prop. When true, the codemod emits `sx={style}`
 * instead of `{...stylex.props(style)}` on the wrapped element.
 *
 * Two signals are consulted, in order:
 *   1. The adapter `wrappedComponentInterface` hook — explicit override.
 *   2. Static auto-detection of an `sx?: …` member on the imported
 *      component's props type.
 *
 * Used by both the wrapper-emitter (full wrapper components) and the
 * JSX-rewrite step (inlined re-styles).
 */
import { existsSync, readFileSync } from "node:fs";
import jscodeshift, { type ASTNode, type JSCodeshift } from "jscodeshift";
import type { Adapter, ImportSource } from "../adapter.js";
import { createModuleResolver } from "./prepass/resolve-imports.js";

export function isWrappedComponentSxAware(args: {
  adapter: Pick<Adapter, "useSxProp" | "wrappedComponentInterface">;
  importMap: ReadonlyMap<string, { importedName: string; source: ImportSource }> | undefined;
  componentLocalName: string;
  filePath: string;
}): boolean {
  const { adapter, importMap, componentLocalName, filePath } = args;
  if (!adapter.useSxProp || !importMap) {
    return false;
  }
  const importInfo = importMap.get(componentLocalName);
  if (!importInfo) {
    return false;
  }

  // 1) Adapter override always wins when it returns a value.
  const adapterResult = adapter.wrappedComponentInterface?.({
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
  return detectExportedSxProp(absolutePath, importInfo.importedName);
}

// ────────────────────────────────────────────────────────────────────────────
// Auto-detection: check whether `componentName` exported from `absolutePath`
// declares an `sx?` member on its props type.
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

function detectExportedSxProp(absolutePath: string, componentName: string): boolean {
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

  // Cheap pre-check: if the file doesn't even mention `sx` near the named
  // component, skip parsing entirely. This keeps the common no-match case fast.
  if (!source.includes(SX_PROP_NAME) || !source.includes(componentName)) {
    return false;
  }

  // Always parse with the tsx parser — it's a superset that handles plain JS,
  // JSX, TS and TSX. Misparses on truly novel syntax simply return false.
  let j: JSCodeshift;
  let root: ReturnType<JSCodeshift>;
  try {
    j = jscodeshift.withParser("tsx");
    root = j(source);
  } catch {
    return false;
  }

  const propsTypeNode = findExportedComponentPropsType(j, root, componentName);
  if (!propsTypeNode) {
    return false;
  }
  return typeMentionsSxMember(j, root, propsTypeNode, new Set());
}

function resolveSourcePath(absolutePath: string): string | null {
  for (const ext of FILE_EXTENSIONS) {
    const candidate = absolutePath + ext;
    if (existsSync(candidate)) {
      return candidate;
    }
  }
  return null;
}

/**
 * Locate `componentName` exported from `root` and return the TS type
 * annotation of its first parameter, or null.
 *
 * Handles:
 *   - `export function Name(props: T)` and `export default function Name(...)`.
 *   - `export const Name = (props: T) => …` / arrow function variants.
 */
function findExportedComponentPropsType(
  j: JSCodeshift,
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

  root
    .find(j.FunctionDeclaration)
    .filter((p) => {
      const id = p.node.id as { name?: string } | null | undefined;
      return id?.name === componentName;
    })
    .forEach((p) => recordFromParam(p.node.params));

  root
    .find(j.VariableDeclarator)
    .filter((p) => {
      const id = p.node.id as { type?: string; name?: string };
      return id.type === "Identifier" && id.name === componentName;
    })
    .forEach((p) => {
      const init = p.node.init as { type?: string; params?: unknown } | null | undefined;
      if (init && (init.type === "ArrowFunctionExpression" || init.type === "FunctionExpression")) {
        recordFromParam(init.params);
      }
    });

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
function typeMentionsSxMember(
  j: JSCodeshift,
  root: ReturnType<JSCodeshift>,
  node: ASTNode,
  visitedTypeNames: Set<string>,
): boolean {
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
        if (typeMentionsSxMember(j, root, member as ASTNode, visitedTypeNames)) {
          return true;
        }
      }
      return false;
    case "TSParenthesizedType":
      return n.typeAnnotation
        ? typeMentionsSxMember(j, root, n.typeAnnotation, visitedTypeNames)
        : false;
    case "TSTypeReference": {
      const typeName = n.typeName?.name;
      if (!typeName || visitedTypeNames.has(typeName)) {
        return false;
      }
      visitedTypeNames.add(typeName);

      const aliased = root.find(j.TSTypeAliasDeclaration).filter((p) => {
        const id = (p.node as { id?: { name?: string } }).id;
        return id?.name === typeName;
      });
      if (aliased.size() > 0) {
        const annotation = (aliased.get().node as { typeAnnotation?: ASTNode }).typeAnnotation;
        if (annotation && typeMentionsSxMember(j, root, annotation, visitedTypeNames)) {
          return true;
        }
      }

      const iface = root.find(j.TSInterfaceDeclaration).filter((p) => {
        const id = (p.node as { id?: { name?: string } }).id;
        return id?.name === typeName;
      });
      if (iface.size() > 0) {
        const body = (iface.get().node as { body?: { body?: unknown[] } }).body?.body;
        if (literalContainsSxMember(body)) {
          return true;
        }
      }
      return false;
    }
    default:
      return false;
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

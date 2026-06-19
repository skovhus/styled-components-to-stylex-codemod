/**
 * Step: emit stylex.create objects and resolver imports.
 * Core concepts: style emission and import aliasing.
 */
import { basename } from "node:path";
import { emitStylesAndImports } from "../emit-styles.js";
import { CONTINUE, type StepResult } from "../transform-types.js";
import { TransformContext } from "../transform-context.js";
import {
  type ExpressionKind,
  maybeOmitPxUnitFromStylexStyleValue,
  maybeOmitPxUnitFromStylexValue,
} from "../utilities/stylex-numeric-values.js";
import { isNumericTsType } from "../utilities/jscodeshift-utils.js";
import { isStylexImportSource } from "../utilities/stylex-import-source.js";
import {
  collectNumericStylexImportBindings,
  type StylexImportBinding,
} from "../utilities/stylex-numeric-imports.js";
import {
  importSourceToAbsolutePath,
  importSourceToModuleSpecifier,
} from "../utilities/import-source.js";
import { insertAfterLastImport } from "../utilities/import-insertion.js";

/**
 * Emits stylex.create objects and required imports, applying resolver import aliasing.
 */
export function emitStylesStep(ctx: TransformContext): StepResult {
  if (!ctx.styledDecls || !ctx.styledImports) {
    return CONTINUE;
  }

  normalizeResolvedNumericPxValues(ctx);

  const { emptyStyleKeys } = emitStylesAndImports(ctx);
  ctx.emptyStyleKeys = emptyStyleKeys;
  ctx.markChanged();

  // Emit defineMarker() declarations for cross-file parent components
  if (ctx.crossFileMarkers && ctx.crossFileMarkers.size > 0) {
    emitDefineMarkerDeclarations(ctx, ctx.crossFileMarkers);
  }

  if (ctx.resolverImportAliases && ctx.resolverImportAliases.size > 0) {
    const renameIdentifier = (node: any, parent: any): void => {
      if (!node || typeof node !== "object") {
        return;
      }
      if (Array.isArray(node)) {
        for (const child of node) {
          renameIdentifier(child, parent);
        }
        return;
      }

      if (node.type === "Identifier") {
        const alias = ctx.resolverImportAliases?.get(node.name);
        if (alias) {
          const parentNode = parent ?? null;
          const isMemberProp =
            parentNode &&
            (parentNode.type === "MemberExpression" ||
              parentNode.type === "OptionalMemberExpression") &&
            parentNode.property === node &&
            parentNode.computed === false;
          const isObjectKey =
            parentNode &&
            parentNode.type === "Property" &&
            parentNode.key === node &&
            parentNode.shorthand !== true;
          const isImport =
            parentNode &&
            (parentNode.type === "ImportSpecifier" ||
              parentNode.type === "ImportDefaultSpecifier" ||
              parentNode.type === "ImportNamespaceSpecifier");
          if (!isMemberProp && !isObjectKey && !isImport) {
            node.name = alias;
          }
        }
      }

      for (const key of Object.keys(node)) {
        if (key === "loc" || key === "comments") {
          continue;
        }
        const child = (node as any)[key];
        if (child && typeof child === "object") {
          renameIdentifier(child, node);
        }
      }
    };

    ctx.root
      .find(ctx.j.CallExpression, {
        callee: {
          type: "MemberExpression",
          object: { type: "Identifier", name: "stylex" },
          property: { type: "Identifier", name: "create" },
        },
      } as any)
      .forEach((p: any) => {
        const args = p.node.arguments ?? [];
        if (args[0]) {
          renameIdentifier(args[0], null);
        }
      });
  }

  return CONTINUE;
}

// --- Non-exported helpers ---

function normalizeResolvedNumericPxValues(ctx: TransformContext): void {
  if (!ctx.resolvedStyleObjects) {
    return;
  }
  const rootNumericIdentifiers = collectRootNumericConstantNames(ctx);
  for (const [key, value] of ctx.resolvedStyleObjects) {
    ctx.resolvedStyleObjects.set(
      key,
      normalizeStylexNumericPxValue(ctx, value, undefined, rootNumericIdentifiers),
    );
  }
}

function collectRootNumericConstantNames(ctx: TransformContext): ReadonlySet<string> {
  const importBindings: StylexImportBinding[] = [];
  ctx.root.find(ctx.j.ImportDeclaration).forEach((path) => {
    const sourceValue = (path.node.source as { value?: unknown }).value;
    if (typeof sourceValue !== "string" || !isStylexImportSource(sourceValue)) {
      return;
    }
    for (const specifier of path.node.specifiers ?? []) {
      const localName = (specifier.local as { name?: string } | null | undefined)?.name;
      const importedName = importSpecifierExportName(specifier);
      if (localName && importedName) {
        importBindings.push({
          localName,
          importedName,
          source: { kind: "specifier", value: sourceValue },
        });
      }
    }
  });
  const names = collectNumericStylexImportBindings({
    j: ctx.j,
    filePath: ctx.file.path,
    bindings: importBindings,
  });
  ctx.root.find(ctx.j.VariableDeclarator).forEach((path) => {
    if (!isImmutableTopLevelVariableDeclaratorPath(path)) {
      return;
    }
    const node = path.node as { id?: unknown; init?: unknown };
    if (!node.id || !node.init) {
      return;
    }
    if (!isNumericExpressionNode(node.init, names)) {
      return;
    }
    collectIdentifierPatternNames(node.id, names);
  });
  return names;
}

function importSpecifierExportName(specifier: unknown): string | null {
  const node = specifier as {
    type?: string;
    imported?: { name?: string; value?: string } | null;
  };
  if (node.type === "ImportDefaultSpecifier") {
    return "default";
  }
  if (node.type !== "ImportSpecifier") {
    return null;
  }
  return node.imported?.name ?? node.imported?.value ?? null;
}

function isImmutableTopLevelVariableDeclaratorPath(path: { parentPath?: unknown }): boolean {
  const declaration = (path.parentPath as { node?: { type?: string; kind?: string } } | undefined)
    ?.node;
  if (declaration?.type !== "VariableDeclaration" || declaration.kind !== "const") {
    return false;
  }
  let current: unknown = path.parentPath;
  while (current && typeof current === "object") {
    const node = (current as { node?: { type?: string } }).node;
    if (node?.type === "Program") {
      return true;
    }
    if (
      node?.type === "FunctionDeclaration" ||
      node?.type === "FunctionExpression" ||
      node?.type === "ArrowFunctionExpression" ||
      node?.type === "ClassDeclaration" ||
      node?.type === "ClassExpression"
    ) {
      return false;
    }
    current = (current as { parentPath?: unknown }).parentPath;
  }
  return false;
}

function collectIdentifierPatternNames(pattern: unknown, names: Set<string>): void {
  if (!pattern || typeof pattern !== "object" || Array.isArray(pattern)) {
    return;
  }
  const node = pattern as {
    type?: string;
    name?: string;
    elements?: unknown[];
    properties?: unknown[];
  };
  if (node.type === "Identifier" && node.name) {
    names.add(node.name);
    return;
  }
  if (node.type === "ArrayPattern" && Array.isArray(node.elements)) {
    for (const element of node.elements) {
      collectIdentifierPatternNames(element, names);
    }
    return;
  }
  if (node.type === "ObjectPattern" && Array.isArray(node.properties)) {
    for (const property of node.properties) {
      if (!property || typeof property !== "object" || Array.isArray(property)) {
        continue;
      }
      collectIdentifierPatternNames(
        (property as { value?: unknown; argument?: unknown }).value,
        names,
      );
      collectIdentifierPatternNames(
        (property as { value?: unknown; argument?: unknown }).argument,
        names,
      );
    }
  }
}

function isNumericExpressionNode(value: unknown, numericIdentifiers: ReadonlySet<string>): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const node = value as {
    type?: string;
    value?: unknown;
    name?: string;
    operator?: string;
    argument?: unknown;
    left?: unknown;
    right?: unknown;
    expression?: unknown;
    object?: unknown;
  };
  if (
    node.type === "NumericLiteral" ||
    (node.type === "Literal" && typeof node.value === "number")
  ) {
    return true;
  }
  if (node.type === "Identifier") {
    return Boolean(node.name && numericIdentifiers.has(node.name));
  }
  if (node.type === "MemberExpression") {
    const rootName = memberExpressionRootName(node);
    return Boolean(rootName && numericIdentifiers.has(rootName));
  }
  if (node.type === "UnaryExpression") {
    return (
      (node.operator === "-" || node.operator === "+") &&
      isNumericExpressionNode(node.argument, numericIdentifiers)
    );
  }
  if (node.type === "BinaryExpression") {
    return (
      ["+", "-", "*", "/", "%", "**"].includes(node.operator ?? "") &&
      isNumericExpressionNode(node.left, numericIdentifiers) &&
      isNumericExpressionNode(node.right, numericIdentifiers)
    );
  }
  if (node.type === "ParenthesizedExpression" || node.type === "TSAsExpression") {
    return isNumericExpressionNode(node.expression, numericIdentifiers);
  }
  return false;
}

function memberExpressionRootName(node: {
  type?: string;
  name?: string;
  object?: unknown;
}): string | null {
  if (node.type === "Identifier") {
    return node.name ?? null;
  }
  if (node.type !== "MemberExpression" || !node.object || typeof node.object !== "object") {
    return null;
  }
  return memberExpressionRootName(
    node.object as { type?: string; name?: string; object?: unknown },
  );
}

function normalizeStylexNumericPxValue(
  ctx: TransformContext,
  value: unknown,
  currentProp: string | undefined,
  numericIdentifiers: ReadonlySet<string>,
): unknown {
  if (!value || typeof value !== "object") {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((entry) =>
      normalizeStylexNumericPxValue(ctx, entry, currentProp, numericIdentifiers),
    );
  }
  const astType = (value as { type?: unknown }).type;
  if (typeof astType === "string") {
    if (currentProp) {
      const converted = maybeOmitPxUnitFromStylexValue(
        ctx.j,
        value as ExpressionKind,
        currentProp,
        false,
        { numericIdentifiers },
      );
      if (converted !== value) {
        return converted;
      }
    }
    normalizeStylexNumericPxAst(
      ctx,
      value as Record<string, unknown>,
      currentProp,
      numericIdentifiers,
    );
    return value;
  }

  const record = value as Record<string, unknown>;
  for (const [key, entryValue] of Object.entries(record)) {
    if (key === "__computedKeys" && Array.isArray(entryValue)) {
      record[key] = entryValue.map((entry) =>
        entry && typeof entry === "object" && !Array.isArray(entry)
          ? {
              ...(entry as Record<string, unknown>),
              value: normalizeStylexNumericPxValue(
                ctx,
                (entry as { value?: unknown }).value,
                currentProp,
                numericIdentifiers,
              ),
            }
          : entry,
      );
      continue;
    }
    const nextProp = isStyleConditionKey(key) ? currentProp : key;
    record[key] = nextProp
      ? maybeOmitPxUnitFromStylexStyleValue(ctx.j, entryValue, nextProp, false, {
          numericIdentifiers,
        })
      : normalizeStylexNumericPxValue(ctx, entryValue, nextProp, numericIdentifiers);
  }
  return record;
}

function normalizeStylexNumericPxAst(
  ctx: TransformContext,
  node: Record<string, unknown>,
  currentProp: string | undefined,
  numericIdentifiers: ReadonlySet<string>,
): void {
  if (node.type === "ArrowFunctionExpression") {
    node.body = normalizeStylexNumericPxValue(
      ctx,
      node.body,
      currentProp,
      collectNumericParamNames(node, numericIdentifiers),
    );
    return;
  }
  if (node.type !== "ObjectExpression" || !Array.isArray(node.properties)) {
    return;
  }
  for (const property of node.properties) {
    if (!property || typeof property !== "object" || Array.isArray(property)) {
      continue;
    }
    const prop = property as { key?: unknown; value?: unknown; computed?: boolean };
    const key = prop.computed ? null : readPropertyKey(prop.key);
    const nextProp = key && !isStyleConditionKey(key) ? key : currentProp;
    prop.value = normalizeStylexNumericPxValue(ctx, prop.value, nextProp, numericIdentifiers);
  }
}

function collectNumericParamNames(
  node: Record<string, unknown>,
  inherited: ReadonlySet<string>,
): ReadonlySet<string> {
  const params = Array.isArray(node.params) ? node.params : [];
  const names = new Set(inherited);
  for (const param of params) {
    if (!param || typeof param !== "object" || Array.isArray(param)) {
      continue;
    }
    const paramNode = param as { type?: string; name?: string; typeAnnotation?: unknown };
    if (paramNode.type === "Identifier" && paramNode.name) {
      names.delete(paramNode.name);
    }
    if (
      paramNode.type === "Identifier" &&
      paramNode.name &&
      isNumericOrOptionalTsTypeAnnotation(paramNode.typeAnnotation)
    ) {
      names.add(paramNode.name);
    }
  }
  return names;
}

function isNumericOrOptionalTsTypeAnnotation(typeAnnotation: unknown): boolean {
  if (!typeAnnotation || typeof typeAnnotation !== "object") {
    return false;
  }
  const node = typeAnnotation as { type?: string; typeAnnotation?: unknown };
  return isNumericTsType(node.type === "TSTypeAnnotation" ? node.typeAnnotation : node, {
    allowOptional: true,
  });
}

function readPropertyKey(key: unknown): string | null {
  if (!key || typeof key !== "object") {
    return null;
  }
  const node = key as { type?: string; name?: string; value?: unknown };
  if (node.type === "Identifier") {
    return node.name ?? null;
  }
  if (node.type === "Literal" || node.type === "StringLiteral") {
    return typeof node.value === "string" ? node.value : null;
  }
  return null;
}

function isStyleConditionKey(key: string): boolean {
  return key === "default" || key.startsWith("@") || key.startsWith(":") || key.startsWith("::");
}

/**
 * Emit defineMarker declarations into sidecar `.stylex.ts` file(s) and insert
 * import(s) for the markers into the main file. StyleX requires defineMarker()
 * to live in `.stylex.ts` files for the babel plugin's `fileNameForHashing`.
 *
 * Cross-file markers (from component selectors across files) are routed to the
 * adapter's `markerFile` destination. Internal markers (sibling selectors within
 * the same file) always go to a local sidecar to avoid polluting a shared file.
 */
function emitDefineMarkerDeclarations(
  ctx: TransformContext,
  crossFileMarkers: Map<string, string>,
): void {
  // Partition markers into cross-file (adapter-routed) and internal (local sidecar)
  const siblingMarkerKeys = ctx.siblingMarkerKeys ?? new Set<string>();
  const crossFileNames: string[] = [];
  const internalNames: string[] = [];
  for (const [styleKey, markerName] of crossFileMarkers) {
    if (siblingMarkerKeys.has(styleKey)) {
      internalNames.push(markerName);
    } else {
      crossFileNames.push(markerName);
    }
  }

  const adapterMarkerFile = ctx.adapter.markerFile;
  const adapterImportSource =
    crossFileNames.length > 0 ? adapterMarkerFile?.({ filePath: ctx.file.path }) : undefined;

  const fileBase = basename(ctx.file.path).replace(/\.\w+$/, "");
  const localImportPath = `./${fileBase}.stylex`;

  // When adapter doesn't provide a path (or returns undefined), all markers go to local sidecar
  if (!adapterImportSource) {
    const allNames = [...crossFileNames, ...internalNames];
    emitMarkerGroup(ctx, allNames, localImportPath, undefined);
    return;
  }

  const adapterPath = importSourceToModuleSpecifier(adapterImportSource, ctx.file.path, {
    stripTsExtension: true,
  });
  const adapterAbsPath = importSourceToAbsolutePath(adapterImportSource, ctx.file.path);

  if (internalNames.length === 0) {
    // All markers are cross-file — single sidecar at adapter destination
    emitMarkerGroup(ctx, crossFileNames, adapterPath, adapterAbsPath);
    return;
  }

  if (crossFileNames.length === 0) {
    // All markers are internal — single local sidecar
    emitMarkerGroup(ctx, internalNames, localImportPath, undefined);
    return;
  }

  // Mixed: cross-file markers to adapter destination, internal to local sidecar
  emitMarkerGroup(ctx, crossFileNames, adapterPath, adapterAbsPath);
  emitMarkerGroup(ctx, internalNames, localImportPath, undefined);
}

/** Build sidecar content and import declaration for a group of markers. */
function emitMarkerGroup(
  ctx: TransformContext,
  markerNames: string[],
  importPath: string,
  absoluteFilePath: string | undefined,
): void {
  const j = ctx.j;
  const markerDecls = markerNames
    .map((name) => {
      const componentName = name.replace(/Marker$/, "");
      return `/** Custom marker for ${componentName} */\nexport const ${name} = stylex.defineMarker();`;
    })
    .join("\n\n");
  const content = `import * as stylex from "@stylexjs/stylex";\n\n${markerDecls}\n`;

  if (!ctx.sidecarFiles) {
    ctx.sidecarFiles = [];
  }
  ctx.sidecarFiles.push({ content, filePath: absoluteFilePath });

  const importDecl = j.importDeclaration(
    markerNames.map((name) => j.importSpecifier(j.identifier(name))),
    j.literal(importPath),
  );

  insertAfterLastImport(
    ctx.root.get().node.program.body,
    importDecl as unknown as { type?: string },
  );
}

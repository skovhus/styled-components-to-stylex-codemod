import path from "node:path";
import ts from "typescript";
import { resolveExistingFilePath } from "../utilities/path-utils.js";

export interface TypeScriptPrepassMetadata {
  version: 1;
  files: TypeScriptFileMetadata[];
}

export interface TypeScriptFileMetadata {
  filePath: string;
  components: TypeScriptComponentMetadata[];
  functions: TypeScriptFunctionMetadata[];
}

export interface TypeScriptComponentMetadata {
  name: string;
  kind: "styled" | "react";
  exported: boolean;
  defaultExport: boolean;
  typeParameters: string[];
  propType: TypeScriptTypeMetadata | null;
  props: TypeScriptPropMetadata[];
  explicitPropNames: string[];
  parameters: TypeScriptParameterMetadata[];
  restProps: TypeScriptRestPropMetadata[];
  hasIndexSignature: boolean;
  supportsSxProp: boolean;
  sxTarget?: "root" | "inner";
  sxExcludedProperties: string[];
  sxAllowedProperties?: string[];
}

interface TypeScriptFunctionMetadata {
  name: string;
  exported: boolean;
  defaultExport: boolean;
  typeParameters: string[];
  parameters: TypeScriptParameterMetadata[];
}

export interface TypeScriptTypeMetadata {
  text: string;
  inheritedTypes: string[];
  intersectionTypes: string[];
  unionTypes: string[];
}

export interface TypeScriptPropMetadata {
  name: string;
  optional: boolean;
  readonly: boolean;
  type: string;
}

export interface TypeScriptParameterMetadata {
  name: string;
  optional: boolean;
  rest: boolean;
  type: string;
}

export interface TypeScriptRestPropMetadata {
  name: string;
  source: "parameter" | "destructure";
}

export function analyzeTypeScriptProgram(options: {
  files: readonly string[];
  cwd?: string;
}): TypeScriptPrepassMetadata {
  const rootNames = normalizeFilePaths(options.files).filter(isTypeScriptLikeFile);
  if (rootNames.length === 0) {
    return { version: 1, files: [] };
  }

  const program = createProgram(rootNames, options.cwd ?? process.cwd());
  const checker = program.getTypeChecker();
  const rootNameSet = new Set(rootNames.map((filePath) => path.resolve(filePath)));
  // TS adds `| undefined` to optional prop types only when strictNullChecks is
  // on (or its parent flag `strict`). We mirror that gating so the cheap
  // syntactic-type path matches the resolved-type behavior the prior
  // implementation produced via `getTypeOfSymbolAtLocation` + `typeToString`.
  const compilerOptions = program.getCompilerOptions();
  strictNullChecksOnForCurrentRun = Boolean(
    compilerOptions.strictNullChecks ?? compilerOptions.strict,
  );
  const files = program
    .getSourceFiles()
    .filter((sourceFile) => rootNameSet.has(path.resolve(sourceFile.fileName)))
    .map((sourceFile) => analyzeSourceFile(sourceFile, checker))
    .filter((file) => file.components.length > 0 || file.functions.length > 0)
    .sort((a, b) => a.filePath.localeCompare(b.filePath));

  return { version: 1, files };
}

function analyzeSourceFile(
  sourceFile: ts.SourceFile,
  checker: ts.TypeChecker,
): TypeScriptFileMetadata {
  const exportedNames = getExportedNames(sourceFile, checker);
  const defaultExportedLocalNames = getDefaultExportedLocalNames(sourceFile);
  const localFunctionInitializers = collectLocalFunctionInitializers(sourceFile);
  const components: TypeScriptComponentMetadata[] = [];
  const functions: TypeScriptFunctionMetadata[] = [];

  const visit = (node: ts.Node): void => {
    if (ts.isFunctionDeclaration(node) && (node.name || isDefaultExport(node))) {
      const fn = readFunctionDeclaration(node, checker, exportedNames);
      functions.push(fn);
      if (isReactComponentFunction(node, checker)) {
        components.push(
          readReactComponentFromFunction(node, checker, exportedNames, defaultExportedLocalNames),
        );
      }
      return;
    }

    if (ts.isVariableStatement(node)) {
      for (const declaration of node.declarationList.declarations) {
        if (!ts.isIdentifier(declaration.name)) {
          continue;
        }
        if (declaration.initializer && isStyledComponentInitializer(declaration.initializer)) {
          components.push(readStyledComponent(declaration, node, checker, exportedNames));
          continue;
        }
        const componentInitializer = declaration.initializer
          ? getComponentFunctionInitializerInfo(declaration.initializer, localFunctionInitializers)
          : undefined;
        if (componentInitializer) {
          functions.push(
            readVariableFunction(declaration.name.text, componentInitializer.fn, node, checker),
          );
          if (isReactComponentName(declaration.name.text) || returnsJsx(componentInitializer.fn)) {
            components.push(
              readReactComponentFromVariable(
                declaration.name.text,
                componentInitializer.fn,
                componentInitializer.propTypeNode,
                node,
                checker,
                exportedNames,
                defaultExportedLocalNames,
              ),
            );
          }
        }
      }
      return;
    }

    ts.forEachChild(node, visit);
  };

  ts.forEachChild(sourceFile, visit);

  return {
    filePath: normalizeFilePath(sourceFile.fileName),
    components: components.sort(byName),
    functions: functions.sort(byName),
  };
}

function readFunctionDeclaration(
  node: ts.FunctionDeclaration,
  checker: ts.TypeChecker,
  exportedNames: ReadonlySet<string>,
): TypeScriptFunctionMetadata {
  const name = node.name?.text ?? "default";
  return {
    name,
    exported: exportedNames.has(name),
    defaultExport: isDefaultExport(node),
    typeParameters: readTypeParameters(node.typeParameters),
    parameters: readParameters(node.parameters, checker),
  };
}

function readVariableFunction(
  name: string,
  node: ts.FunctionDeclaration | ts.ArrowFunction | ts.FunctionExpression,
  statement: ts.VariableStatement,
  checker: ts.TypeChecker,
): TypeScriptFunctionMetadata {
  return {
    name,
    exported: isExported(statement),
    defaultExport: false,
    typeParameters: readTypeParameters(node.typeParameters),
    parameters: readParameters(node.parameters, checker),
  };
}

function readStyledComponent(
  declaration: ts.VariableDeclaration,
  statement: ts.VariableStatement,
  checker: ts.TypeChecker,
  exportedNames: ReadonlySet<string>,
): TypeScriptComponentMetadata {
  const name = declaration.name.getText();
  const typeNode = declaration.initializer
    ? findStyledPropsTypeNode(declaration.initializer)
    : undefined;
  return buildComponentMetadata({
    name,
    kind: "styled",
    exported: exportedNames.has(name) || isExported(statement),
    defaultExport: false,
    typeParameters: [],
    propTypeNode: typeNode,
    parameters: [],
    restProps: [],
    checker,
    location: declaration,
  });
}

function readReactComponentFromFunction(
  node: ts.FunctionDeclaration,
  checker: ts.TypeChecker,
  exportedNames: ReadonlySet<string>,
  defaultExportedLocalNames: ReadonlySet<string>,
): TypeScriptComponentMetadata {
  const name = node.name?.text ?? "default";
  return buildComponentMetadata({
    name,
    kind: "react",
    exported: exportedNames.has(name),
    defaultExport: isDefaultExport(node) || defaultExportedLocalNames.has(name),
    typeParameters: readTypeParameters(node.typeParameters),
    propTypeNode: node.parameters[0]?.type,
    parameters: readParameters(node.parameters, checker),
    restProps: readRestProps(node.parameters[0], node.body),
    bodySupportsSxProp: readsSxProp(node.parameters[0], node.body),
    bodySxTarget: detectSxTarget(node.parameters[0], node.body),
    checker,
    location: node,
  });
}

function readReactComponentFromVariable(
  name: string,
  node: ts.FunctionDeclaration | ts.ArrowFunction | ts.FunctionExpression,
  propTypeNode: ts.TypeNode | undefined,
  statement: ts.VariableStatement,
  checker: ts.TypeChecker,
  exportedNames: ReadonlySet<string>,
  defaultExportedLocalNames: ReadonlySet<string>,
): TypeScriptComponentMetadata {
  return buildComponentMetadata({
    name,
    kind: "react",
    exported: exportedNames.has(name) || isExported(statement),
    defaultExport: defaultExportedLocalNames.has(name),
    typeParameters: readTypeParameters(node.typeParameters),
    propTypeNode: propTypeNode ?? node.parameters[0]?.type,
    parameters: readParameters(node.parameters, checker),
    restProps: readRestProps(node.parameters[0], node.body),
    bodySupportsSxProp: readsSxProp(node.parameters[0], node.body),
    bodySxTarget: detectSxTarget(node.parameters[0], node.body),
    checker,
    location: node,
  });
}

function buildComponentMetadata(args: {
  name: string;
  kind: TypeScriptComponentMetadata["kind"];
  exported: boolean;
  defaultExport: boolean;
  typeParameters: string[];
  propTypeNode: ts.TypeNode | undefined;
  parameters: TypeScriptParameterMetadata[];
  restProps: TypeScriptRestPropMetadata[];
  bodySupportsSxProp?: boolean;
  bodySxTarget?: "root" | "inner";
  checker: ts.TypeChecker;
  location: ts.Node;
}): TypeScriptComponentMetadata {
  const propType = args.propTypeNode ? args.checker.getTypeFromTypeNode(args.propTypeNode) : null;
  const props = propType ? readPropsFromType(propType, args.checker, args.location) : [];
  const explicitPropNames = args.propTypeNode
    ? collectExplicitPropNames(args.propTypeNode, args.checker)
    : [];
  const supportsResolvedSxProp =
    props.some((prop) => prop.name === "sx") &&
    args.propTypeNode !== undefined &&
    typeNodeHasResolvableSxSurface(args.propTypeNode, args.checker, new Set());
  const sxExcludedProperties =
    args.propTypeNode !== undefined
      ? collectSxExcludedProperties(args.propTypeNode, args.checker, new Set())
      : [];
  const sxAllowedProperties =
    args.propTypeNode !== undefined
      ? collectSxAllowedProperties(args.propTypeNode, args.checker, new Set())
      : undefined;
  return {
    name: args.name,
    kind: args.kind,
    exported: args.exported,
    defaultExport: args.defaultExport,
    typeParameters: args.typeParameters,
    propType: args.propTypeNode ? describeTypeNode(args.propTypeNode, args.checker) : null,
    props,
    explicitPropNames,
    parameters: args.parameters,
    restProps: args.restProps,
    hasIndexSignature: propType ? hasIndexSignature(propType, args.checker) : false,
    supportsSxProp:
      explicitPropNames.includes("sx") ||
      supportsResolvedSxProp ||
      args.bodySupportsSxProp === true,
    ...(args.bodySxTarget ? { sxTarget: args.bodySxTarget } : {}),
    sxExcludedProperties,
    ...(sxAllowedProperties !== undefined ? { sxAllowedProperties } : {}),
  };
}

function readPropsFromType(
  type: ts.Type,
  checker: ts.TypeChecker,
  location: ts.Node,
): TypeScriptPropMetadata[] {
  return checker
    .getPropertiesOfType(type)
    .map((symbol) => {
      const declaration = symbol.valueDeclaration ?? symbol.declarations?.[0] ?? location;
      const optional = (symbol.flags & ts.SymbolFlags.Optional) !== 0;
      return {
        name: symbol.getName(),
        optional,
        readonly: isReadonlyProperty(symbol),
        type: withOptionalUndefined(
          readPropTypeString(symbol, declaration, checker, location),
          optional,
        ),
      };
    })
    .sort(byName);
}

/**
 * TS's resolved type for an optional property includes `| undefined` (because
 * the `?` modifier widens it). Syntactic type nodes don't — `?: number` has
 * `type === number`, not `number | undefined`. Downstream consumers
 * (lower-rules/types.ts) rely on the `| undefined` suffix to gate certain
 * emit decisions (e.g. wrapping a possibly-undefined value in a template
 * string). Reconstruct it here so the syntactic fast path stays
 * behaviorally equivalent to the typeToString path it replaced.
 */
function withOptionalUndefined(typeText: string, optional: boolean): string {
  if (!optional || !strictNullChecksOnForCurrentRun) {
    return typeText;
  }
  if (/\bundefined\b/.test(typeText)) {
    return typeText;
  }
  return `${typeText} | undefined`;
}

/**
 * Per-run capture of strictNullChecks. Set by `analyzeTypeScriptProgram` before
 * any per-file work runs; read by `withOptionalUndefined` to decide whether to
 * append `| undefined` to optional props. Module-scoped to avoid threading the
 * boolean through ~6 helper signatures for a single read site.
 */
let strictNullChecksOnForCurrentRun = false;

/**
 * Returns the prop's TS type as a string. Prefers the syntactic type annotation
 * from the declaration AST (cheap, no checker call) and only falls back to
 * `checker.typeToString` when the declaration has no usable type node — typically
 * synthesized properties (mapped/intersection/spread-derived) where the checker
 * is the only source of truth.
 *
 * Why: typeToString with NoTruncation dominated the prepass at 39s / 723K calls.
 * For the consumers downstream (lower-rules/types.ts parseTypeText), the
 * syntactic representation is what they want anyway — they only handle
 * TSTypeReference / TSUnionType / TSLiteralType shapes.
 */
function readPropTypeString(
  symbol: ts.Symbol,
  declaration: ts.Node,
  _checker: ts.TypeChecker,
  _location: ts.Node,
): string {
  const typeNode = getDeclarationTypeNode(declaration);
  if (typeNode) {
    return typeNode.getText();
  }
  // No syntactic type node — this is a synthesized property (inherited from
  // React.HTMLAttributes / mapped/intersection types). The previous fallback
  // here called `checker.typeToString(...)` which dominated TS prepass cost
  // at ~11s / 45K calls. Downstream consumers (`lower-rules/types.ts`
  // `parseTypeText`, `type-helpers.ts` boolean detection) gracefully handle
  // an empty string: parseTypeText returns null on falsy input, the boolean
  // check fails. For inherited HTMLAttributes-derived props the rendered type
  // string would have been too complex for parseTypeText to consume anyway
  // (`(string | number | undefined) & React.HTMLAttributes<...>` etc.), so
  // skipping the resolver here loses no actionable information.
  void symbol;
  return "";
}

function getDeclarationTypeNode(declaration: ts.Node): ts.TypeNode | undefined {
  if (
    ts.isPropertySignature(declaration) ||
    ts.isPropertyDeclaration(declaration) ||
    ts.isParameter(declaration)
  ) {
    return declaration.type;
  }
  return undefined;
}

function readParameters(
  parameters: ts.NodeArray<ts.ParameterDeclaration>,
  checker: ts.TypeChecker,
): TypeScriptParameterMetadata[] {
  return parameters.map((parameter) => ({
    name: readParameterName(parameter.name),
    optional: Boolean(parameter.questionToken || parameter.initializer),
    rest: Boolean(parameter.dotDotDotToken),
    type: parameter.type
      ? parameter.type.getText()
      : checker.typeToString(checker.getTypeAtLocation(parameter), parameter),
  }));
}

function hasIndexSignature(type: ts.Type, checker: ts.TypeChecker): boolean {
  return (
    checker.getIndexTypeOfType(type, ts.IndexKind.String) !== undefined ||
    checker.getIndexTypeOfType(type, ts.IndexKind.Number) !== undefined
  );
}

function collectExplicitPropNames(
  typeNode: ts.TypeNode,
  checker: ts.TypeChecker,
  visited = new Set<ts.Declaration>(),
): string[] {
  const names = new Set<string>();
  collectExplicitPropNamesInto(names, typeNode, checker, visited);
  return [...names].sort();
}

function collectExplicitPropNamesInto(
  names: Set<string>,
  typeNode: ts.TypeNode,
  checker: ts.TypeChecker,
  visited: Set<ts.Declaration>,
): void {
  if (ts.isTypeLiteralNode(typeNode)) {
    for (const member of typeNode.members) {
      if (ts.isPropertySignature(member)) {
        const name = propertyNameText(member.name);
        if (name) {
          names.add(name);
        }
      }
    }
    return;
  }

  if (ts.isIntersectionTypeNode(typeNode)) {
    for (const part of typeNode.types) {
      collectExplicitPropNamesInto(names, part, checker, visited);
    }
    return;
  }

  if (ts.isUnionTypeNode(typeNode)) {
    let commonNames: Set<string> | undefined;
    for (const part of typeNode.types) {
      const branchNames = new Set<string>();
      collectExplicitPropNamesInto(branchNames, part, checker, new Set(visited));
      if (commonNames === undefined) {
        commonNames = branchNames;
      } else {
        for (const name of commonNames) {
          if (!branchNames.has(name)) {
            commonNames.delete(name);
          }
        }
      }
    }
    for (const name of commonNames ?? []) {
      names.add(name);
    }
    return;
  }

  if (!ts.isTypeReferenceNode(typeNode) || isIntrinsicReactPropReference(typeNode)) {
    return;
  }

  const utilityType = readUtilityTypeReference(typeNode);
  if (utilityType.name === "Pick") {
    if (utilityType.typeArgs[0]) {
      const pickedNames = new Set<string>();
      collectExplicitPropNamesInto(pickedNames, utilityType.typeArgs[0], checker, visited);
      for (const name of pickedNames) {
        if (typeNodeKeyIncludes(utilityType.typeArgs[1], name)) {
          names.add(name);
        }
      }
    }
    return;
  }
  if (utilityType.name === "Omit") {
    if (utilityType.typeArgs[0]) {
      const omittedNames = new Set<string>();
      collectExplicitPropNamesInto(omittedNames, utilityType.typeArgs[0], checker, visited);
      for (const name of omittedNames) {
        if (!typeNodeKeyIncludes(utilityType.typeArgs[1], name)) {
          names.add(name);
        }
      }
    }
    return;
  }
  if (isTransparentUtilityTypeName(utilityType.name)) {
    if (utilityType.typeArgs[0]) {
      collectExplicitPropNamesInto(names, utilityType.typeArgs[0], checker, visited);
    }
    return;
  }

  const symbol = resolveAliasedSymbol(checker.getSymbolAtLocation(typeNode.typeName), checker);
  for (const declaration of symbol?.declarations ?? []) {
    collectExplicitPropNamesFromDeclaration(names, declaration, checker, visited);
  }
}

function typeNodeHasResolvableSxSurface(
  typeNode: ts.TypeNode,
  checker: ts.TypeChecker,
  visited: Set<ts.Declaration>,
): boolean {
  if (ts.isTypeLiteralNode(typeNode)) {
    return typeNode.members.some(
      (member) => ts.isPropertySignature(member) && propertyNameText(member.name) === "sx",
    );
  }

  if (ts.isIntersectionTypeNode(typeNode)) {
    return typeNode.types.some((part) => typeNodeHasResolvableSxSurface(part, checker, visited));
  }

  if (ts.isUnionTypeNode(typeNode)) {
    return typeNode.types.every((part) => typeNodeHasResolvableSxSurface(part, checker, visited));
  }

  if (!ts.isTypeReferenceNode(typeNode) || isIntrinsicReactPropReference(typeNode)) {
    return false;
  }

  const utilityType = readUtilityTypeReference(typeNode);
  if (utilityType.name === "Pick") {
    return utilityType.typeArgs.length >= 2 && typeNodeKeyIncludes(utilityType.typeArgs[1], "sx");
  }
  if (utilityType.name === "Omit") {
    const baseType = utilityType.typeArgs[0];
    return (
      baseType !== undefined &&
      utilityType.typeArgs.length >= 2 &&
      !typeNodeKeyIncludes(utilityType.typeArgs[1], "sx") &&
      typeNodeHasResolvableSxSurface(baseType, checker, visited)
    );
  }
  if (isTransparentUtilityTypeName(utilityType.name)) {
    const baseType = utilityType.typeArgs[0];
    return baseType !== undefined && typeNodeHasResolvableSxSurface(baseType, checker, visited);
  }

  const symbol = resolveAliasedSymbol(checker.getSymbolAtLocation(typeNode.typeName), checker);
  return (symbol?.declarations ?? []).some((declaration) =>
    declarationHasResolvableSxSurface(declaration, checker, visited),
  );
}

function readUtilityTypeReference(typeNode: ts.TypeReferenceNode): {
  name: string;
  typeArgs: readonly ts.TypeNode[];
} {
  return {
    name: typeNode.typeName.getText(),
    typeArgs: typeNode.typeArguments ?? [],
  };
}

function isTransparentUtilityTypeName(typeName: string): boolean {
  return typeName === "Partial" || typeName === "Required" || typeName === "Readonly";
}

function collectSxExcludedProperties(
  typeNode: ts.TypeNode,
  checker: ts.TypeChecker,
  visited: Set<ts.Declaration>,
): string[] {
  return collectSxSurfaceProperties(typeNode, checker, visited, collectStyleXStylesWithoutKeys)
    .properties;
}

function collectSxAllowedProperties(
  typeNode: ts.TypeNode,
  checker: ts.TypeChecker,
  visited: Set<ts.Declaration>,
): string[] | undefined {
  const collection = collectSxSurfaceProperties(
    typeNode,
    checker,
    visited,
    collectStyleXStylesKeys,
  );
  return collection.found ? collection.properties : undefined;
}

function collectSxSurfaceProperties(
  typeNode: ts.TypeNode,
  checker: ts.TypeChecker,
  visited: Set<ts.Declaration>,
  collectFromSxType: SxTypePropertyCollector,
): { properties: string[]; found: boolean } {
  const names = new Set<string>();
  const found = collectSxSurfacePropertiesInto(
    names,
    typeNode,
    checker,
    visited,
    collectFromSxType,
  );
  return { properties: [...names].sort(), found };
}

type SxTypePropertyCollector = (
  names: Set<string>,
  typeNode: ts.TypeNode,
  checker: ts.TypeChecker,
  visited: Set<ts.Declaration>,
) => boolean;

function collectSxSurfacePropertiesInto(
  names: Set<string>,
  typeNode: ts.TypeNode,
  checker: ts.TypeChecker,
  visited: Set<ts.Declaration>,
  collectFromSxType: SxTypePropertyCollector,
): boolean {
  if (ts.isTypeLiteralNode(typeNode)) {
    let found = false;
    for (const member of typeNode.members) {
      if (
        !ts.isPropertySignature(member) ||
        propertyNameText(member.name) !== "sx" ||
        !member.type
      ) {
        continue;
      }
      found = collectFromSxType(names, member.type, checker, visited) || found;
    }
    return found;
  }

  if (ts.isIntersectionTypeNode(typeNode) || ts.isUnionTypeNode(typeNode)) {
    let found = false;
    for (const part of typeNode.types) {
      found =
        collectSxSurfacePropertiesInto(names, part, checker, visited, collectFromSxType) || found;
    }
    return found;
  }

  if (!ts.isTypeReferenceNode(typeNode) || isIntrinsicReactPropReference(typeNode)) {
    return false;
  }

  const utilityType = readUtilityTypeReference(typeNode);
  if (utilityType.name === "Pick") {
    if (
      utilityType.typeArgs.length >= 2 &&
      typeNodeKeyIncludes(utilityType.typeArgs[1], "sx") &&
      utilityType.typeArgs[0]
    ) {
      return collectSxSurfacePropertiesInto(
        names,
        utilityType.typeArgs[0],
        checker,
        visited,
        collectFromSxType,
      );
    }
    return false;
  }
  if (utilityType.name === "Omit") {
    if (
      utilityType.typeArgs.length >= 2 &&
      !typeNodeKeyIncludes(utilityType.typeArgs[1], "sx") &&
      utilityType.typeArgs[0]
    ) {
      return collectSxSurfacePropertiesInto(
        names,
        utilityType.typeArgs[0],
        checker,
        visited,
        collectFromSxType,
      );
    }
    return false;
  }
  if (isTransparentUtilityTypeName(utilityType.name)) {
    if (utilityType.typeArgs[0]) {
      return collectSxSurfacePropertiesInto(
        names,
        utilityType.typeArgs[0],
        checker,
        visited,
        collectFromSxType,
      );
    }
    return false;
  }

  const symbol = resolveAliasedSymbol(checker.getSymbolAtLocation(typeNode.typeName), checker);
  let found = false;
  for (const declaration of symbol?.declarations ?? []) {
    found =
      collectSxSurfacePropertiesFromDeclaration(
        names,
        declaration,
        checker,
        visited,
        collectFromSxType,
      ) || found;
  }
  return found;
}

function collectSxSurfacePropertiesFromDeclaration(
  names: Set<string>,
  declaration: ts.Declaration,
  checker: ts.TypeChecker,
  visited: Set<ts.Declaration>,
  collectFromSxType: SxTypePropertyCollector,
): boolean {
  if (visited.has(declaration)) {
    return false;
  }
  visited.add(declaration);

  if (ts.isTypeAliasDeclaration(declaration)) {
    return collectSxSurfacePropertiesInto(
      names,
      declaration.type,
      checker,
      visited,
      collectFromSxType,
    );
  }

  if (!ts.isInterfaceDeclaration(declaration)) {
    return false;
  }

  let found = false;
  for (const member of declaration.members) {
    if (ts.isPropertySignature(member) && propertyNameText(member.name) === "sx" && member.type) {
      found = collectFromSxType(names, member.type, checker, visited) || found;
    }
  }

  for (const clause of declaration.heritageClauses ?? []) {
    for (const heritageType of clause.types) {
      if (isIntrinsicReactHeritageReference(heritageType)) {
        continue;
      }
      const symbol = resolveAliasedSymbol(
        checker.getSymbolAtLocation(heritageType.expression),
        checker,
      );
      for (const inheritedDeclaration of symbol?.declarations ?? []) {
        found =
          collectSxSurfacePropertiesFromDeclaration(
            names,
            inheritedDeclaration,
            checker,
            visited,
            collectFromSxType,
          ) || found;
      }
    }
  }
  return found;
}

function collectStyleXStylesWithoutKeys(
  names: Set<string>,
  typeNode: ts.TypeNode,
  checker: ts.TypeChecker,
  visited: Set<ts.Declaration>,
): boolean {
  if (ts.isTypeReferenceNode(typeNode)) {
    const typeName = typeNode.typeName.getText();
    if (typeName.endsWith("StyleXStylesWithout")) {
      collectPropertyKeysFromTypeNode(names, typeNode.typeArguments?.[0], checker, visited);
      return true;
    }
    const symbol = resolveAliasedSymbol(checker.getSymbolAtLocation(typeNode.typeName), checker);
    let found = false;
    for (const declaration of symbol?.declarations ?? []) {
      if (visited.has(declaration)) {
        continue;
      }
      visited.add(declaration);
      if (ts.isTypeAliasDeclaration(declaration)) {
        found = collectStyleXStylesWithoutKeys(names, declaration.type, checker, visited) || found;
      } else if (ts.isInterfaceDeclaration(declaration)) {
        found =
          collectStyleXStylesWithoutKeysFromInterface(names, declaration, checker, visited) ||
          found;
      }
    }
    return found;
  }

  if (ts.isIntersectionTypeNode(typeNode) || ts.isUnionTypeNode(typeNode)) {
    let found = false;
    for (const part of typeNode.types) {
      found = collectStyleXStylesWithoutKeys(names, part, checker, visited) || found;
    }
    return found;
  }
  return false;
}

function collectStyleXStylesWithoutKeysFromInterface(
  names: Set<string>,
  declaration: ts.InterfaceDeclaration,
  checker: ts.TypeChecker,
  visited: Set<ts.Declaration>,
): boolean {
  let found = false;
  for (const clause of declaration.heritageClauses ?? []) {
    for (const heritageType of clause.types) {
      if (isIntrinsicReactHeritageReference(heritageType)) {
        continue;
      }
      const typeName = heritageType.expression.getText();
      if (typeName.endsWith("StyleXStylesWithout")) {
        collectPropertyKeysFromTypeNode(names, heritageType.typeArguments?.[0], checker, visited);
        found = true;
        continue;
      }
      const symbol = resolveAliasedSymbol(
        checker.getSymbolAtLocation(heritageType.expression),
        checker,
      );
      for (const inheritedDeclaration of symbol?.declarations ?? []) {
        if (visited.has(inheritedDeclaration)) {
          continue;
        }
        visited.add(inheritedDeclaration);
        if (ts.isTypeAliasDeclaration(inheritedDeclaration)) {
          found =
            collectStyleXStylesWithoutKeys(names, inheritedDeclaration.type, checker, visited) ||
            found;
        } else if (ts.isInterfaceDeclaration(inheritedDeclaration)) {
          found =
            collectStyleXStylesWithoutKeysFromInterface(
              names,
              inheritedDeclaration,
              checker,
              visited,
            ) || found;
        }
      }
    }
  }
  return found;
}

function collectStyleXStylesKeys(
  names: Set<string>,
  typeNode: ts.TypeNode,
  checker: ts.TypeChecker,
  visited: Set<ts.Declaration>,
): boolean {
  if (ts.isTypeReferenceNode(typeNode)) {
    const typeName = typeNode.typeName.getText();
    if (typeName.endsWith("StyleXStyles") && typeNode.typeArguments?.[0]) {
      collectPropertyKeysFromTypeNode(names, typeNode.typeArguments[0], checker, visited);
      return true;
    }
    const symbol = resolveAliasedSymbol(checker.getSymbolAtLocation(typeNode.typeName), checker);
    let found = false;
    for (const declaration of symbol?.declarations ?? []) {
      if (visited.has(declaration)) {
        continue;
      }
      visited.add(declaration);
      if (ts.isTypeAliasDeclaration(declaration)) {
        found = collectStyleXStylesKeys(names, declaration.type, checker, visited) || found;
      } else if (ts.isInterfaceDeclaration(declaration)) {
        found = collectStyleXStylesKeysFromInterface(names, declaration, checker, visited) || found;
      }
    }
    return found;
  }

  if (ts.isIntersectionTypeNode(typeNode) || ts.isUnionTypeNode(typeNode)) {
    let found = false;
    for (const part of typeNode.types) {
      found = collectStyleXStylesKeys(names, part, checker, visited) || found;
    }
    return found;
  }
  return false;
}

function collectStyleXStylesKeysFromInterface(
  names: Set<string>,
  declaration: ts.InterfaceDeclaration,
  checker: ts.TypeChecker,
  visited: Set<ts.Declaration>,
): boolean {
  let found = false;
  for (const clause of declaration.heritageClauses ?? []) {
    for (const heritageType of clause.types) {
      if (isIntrinsicReactHeritageReference(heritageType)) {
        continue;
      }
      const typeName = heritageType.expression.getText();
      if (typeName.endsWith("StyleXStyles") && heritageType.typeArguments?.[0]) {
        collectPropertyKeysFromTypeNode(names, heritageType.typeArguments[0], checker, visited);
        found = true;
        continue;
      }
      const symbol = resolveAliasedSymbol(
        checker.getSymbolAtLocation(heritageType.expression),
        checker,
      );
      for (const inheritedDeclaration of symbol?.declarations ?? []) {
        if (visited.has(inheritedDeclaration)) {
          continue;
        }
        visited.add(inheritedDeclaration);
        if (ts.isTypeAliasDeclaration(inheritedDeclaration)) {
          found =
            collectStyleXStylesKeys(names, inheritedDeclaration.type, checker, visited) || found;
        } else if (ts.isInterfaceDeclaration(inheritedDeclaration)) {
          found =
            collectStyleXStylesKeysFromInterface(names, inheritedDeclaration, checker, visited) ||
            found;
        }
      }
    }
  }
  return found;
}

function collectPropertyKeysFromTypeNode(
  names: Set<string>,
  typeNode: ts.TypeNode | undefined,
  checker: ts.TypeChecker,
  visited: Set<ts.Declaration>,
): void {
  if (!typeNode) {
    return;
  }
  if (ts.isTypeLiteralNode(typeNode)) {
    for (const member of typeNode.members) {
      if (ts.isPropertySignature(member)) {
        const name = propertyNameText(member.name);
        if (name) {
          names.add(name);
        }
      }
    }
    return;
  }
  if (ts.isIntersectionTypeNode(typeNode) || ts.isUnionTypeNode(typeNode)) {
    for (const part of typeNode.types) {
      collectPropertyKeysFromTypeNode(names, part, checker, visited);
    }
    return;
  }
  if (!ts.isTypeReferenceNode(typeNode)) {
    return;
  }
  const utilityType = readUtilityTypeReference(typeNode);
  if (utilityType.name === "Pick") {
    if (utilityType.typeArgs[0]) {
      const pickedNames = new Set<string>();
      collectPropertyKeysFromTypeNode(pickedNames, utilityType.typeArgs[0], checker, visited);
      for (const name of pickedNames) {
        if (typeNodeKeyIncludes(utilityType.typeArgs[1], name)) {
          names.add(name);
        }
      }
    }
    return;
  }
  if (utilityType.name === "Omit") {
    if (utilityType.typeArgs[0]) {
      const omittedNames = new Set<string>();
      collectPropertyKeysFromTypeNode(omittedNames, utilityType.typeArgs[0], checker, visited);
      for (const name of omittedNames) {
        if (!typeNodeKeyIncludes(utilityType.typeArgs[1], name)) {
          names.add(name);
        }
      }
    }
    return;
  }
  if (isTransparentUtilityTypeName(utilityType.name)) {
    if (utilityType.typeArgs[0]) {
      collectPropertyKeysFromTypeNode(names, utilityType.typeArgs[0], checker, visited);
    }
    return;
  }
  const symbol = resolveAliasedSymbol(checker.getSymbolAtLocation(typeNode.typeName), checker);
  for (const declaration of symbol?.declarations ?? []) {
    if (visited.has(declaration)) {
      continue;
    }
    visited.add(declaration);
    if (ts.isTypeAliasDeclaration(declaration)) {
      collectPropertyKeysFromTypeNode(names, declaration.type, checker, visited);
    } else if (ts.isInterfaceDeclaration(declaration)) {
      collectPropertyKeysFromInterfaceDeclaration(names, declaration, checker, visited);
    }
  }
}

function collectPropertyKeysFromInterfaceDeclaration(
  names: Set<string>,
  declaration: ts.InterfaceDeclaration,
  checker: ts.TypeChecker,
  visited: Set<ts.Declaration>,
): void {
  for (const member of declaration.members) {
    if (ts.isPropertySignature(member)) {
      const name = propertyNameText(member.name);
      if (name) {
        names.add(name);
      }
    }
  }

  for (const clause of declaration.heritageClauses ?? []) {
    for (const heritageType of clause.types) {
      if (isIntrinsicReactHeritageReference(heritageType)) {
        continue;
      }
      const symbol = resolveAliasedSymbol(
        checker.getSymbolAtLocation(heritageType.expression),
        checker,
      );
      for (const inheritedDeclaration of symbol?.declarations ?? []) {
        if (visited.has(inheritedDeclaration)) {
          continue;
        }
        visited.add(inheritedDeclaration);
        if (ts.isInterfaceDeclaration(inheritedDeclaration)) {
          collectPropertyKeysFromInterfaceDeclaration(
            names,
            inheritedDeclaration,
            checker,
            visited,
          );
        } else if (ts.isTypeAliasDeclaration(inheritedDeclaration)) {
          collectPropertyKeysFromTypeNode(names, inheritedDeclaration.type, checker, visited);
        }
      }
    }
  }
}

function declarationHasResolvableSxSurface(
  declaration: ts.Declaration,
  checker: ts.TypeChecker,
  visited: Set<ts.Declaration>,
): boolean {
  if (visited.has(declaration)) {
    return false;
  }
  visited.add(declaration);

  if (ts.isTypeAliasDeclaration(declaration)) {
    return typeNodeHasResolvableSxSurface(declaration.type, checker, visited);
  }

  if (!ts.isInterfaceDeclaration(declaration)) {
    return false;
  }

  if (
    declaration.members.some(
      (member) => ts.isPropertySignature(member) && propertyNameText(member.name) === "sx",
    )
  ) {
    return true;
  }

  return (declaration.heritageClauses ?? []).some((clause) =>
    clause.types.some(
      (heritageType) =>
        !isIntrinsicReactHeritageReference(heritageType) &&
        declarationHeritageHasResolvableSxSurface(heritageType, checker, visited),
    ),
  );
}

function declarationHeritageHasResolvableSxSurface(
  heritageType: ts.ExpressionWithTypeArguments,
  checker: ts.TypeChecker,
  visited: Set<ts.Declaration>,
): boolean {
  const symbol = resolveAliasedSymbol(
    checker.getSymbolAtLocation(heritageType.expression),
    checker,
  );
  return (symbol?.declarations ?? []).some((declaration) =>
    declarationHasResolvableSxSurface(declaration, checker, visited),
  );
}

function typeNodeKeyIncludes(typeNode: ts.TypeNode | undefined, key: string): boolean {
  if (!typeNode) {
    return false;
  }
  if (ts.isLiteralTypeNode(typeNode) && ts.isStringLiteral(typeNode.literal)) {
    return typeNode.literal.text === key;
  }
  if (ts.isUnionTypeNode(typeNode)) {
    return typeNode.types.some((part) => typeNodeKeyIncludes(part, key));
  }
  return false;
}

function resolveAliasedSymbol(
  symbol: ts.Symbol | undefined,
  checker: ts.TypeChecker,
): ts.Symbol | undefined {
  if (!symbol || (symbol.flags & ts.SymbolFlags.Alias) === 0) {
    return symbol;
  }
  return checker.getAliasedSymbol(symbol);
}

function collectExplicitPropNamesFromDeclaration(
  names: Set<string>,
  declaration: ts.Declaration,
  checker: ts.TypeChecker,
  visited: Set<ts.Declaration>,
): void {
  if (visited.has(declaration)) {
    return;
  }
  visited.add(declaration);

  if (ts.isTypeAliasDeclaration(declaration)) {
    collectExplicitPropNamesInto(names, declaration.type, checker, visited);
    return;
  }

  if (!ts.isInterfaceDeclaration(declaration)) {
    return;
  }

  for (const member of declaration.members) {
    if (ts.isPropertySignature(member)) {
      const name = propertyNameText(member.name);
      if (name) {
        names.add(name);
      }
    }
  }
  for (const clause of declaration.heritageClauses ?? []) {
    for (const heritageType of clause.types) {
      collectExplicitPropNamesFromHeritage(names, heritageType, checker, visited);
    }
  }
}

function collectExplicitPropNamesFromHeritage(
  names: Set<string>,
  heritageType: ts.ExpressionWithTypeArguments,
  checker: ts.TypeChecker,
  visited: Set<ts.Declaration>,
): void {
  if (isIntrinsicReactHeritageReference(heritageType)) {
    return;
  }
  const symbol = resolveAliasedSymbol(
    checker.getSymbolAtLocation(heritageType.expression),
    checker,
  );
  for (const declaration of symbol?.declarations ?? []) {
    collectExplicitPropNamesFromDeclaration(names, declaration, checker, visited);
  }
}

function isIntrinsicReactPropReference(typeNode: ts.TypeReferenceNode): boolean {
  const typeName = typeNode.typeName.getText();
  return /^(?:React\.)?(?:ComponentProps|ComponentPropsWithRef|ComponentPropsWithoutRef|HTMLAttributes|ButtonHTMLAttributes|AnchorHTMLAttributes|InputHTMLAttributes|SVGProps)$/.test(
    typeName,
  );
}

function isIntrinsicReactHeritageReference(heritageType: ts.ExpressionWithTypeArguments): boolean {
  const typeName = heritageType.expression.getText();
  return /^(?:React\.)?(?:ComponentProps|ComponentPropsWithRef|ComponentPropsWithoutRef|HTMLAttributes|ButtonHTMLAttributes|AnchorHTMLAttributes|InputHTMLAttributes|SVGProps)$/.test(
    typeName,
  );
}

function propertyNameText(name: ts.PropertyName): string | null {
  if (ts.isIdentifier(name) || ts.isStringLiteral(name) || ts.isNumericLiteral(name)) {
    return name.text;
  }
  return null;
}

function readRestProps(
  parameter: ts.ParameterDeclaration | undefined,
  body: ts.ConciseBody | undefined,
): TypeScriptRestPropMetadata[] {
  const restProps: TypeScriptRestPropMetadata[] = [];
  if (parameter?.name && ts.isObjectBindingPattern(parameter.name)) {
    for (const element of parameter.name.elements) {
      if (element.dotDotDotToken) {
        restProps.push({ name: element.name.getText(), source: "parameter" });
      }
    }
  }

  if (!body || !ts.isBlock(body) || !parameter?.name || !ts.isIdentifier(parameter.name)) {
    return restProps;
  }

  const propsName = parameter.name.text;
  const visit = (node: ts.Node): void => {
    if (
      ts.isVariableDeclaration(node) &&
      ts.isObjectBindingPattern(node.name) &&
      node.initializer &&
      ts.isIdentifier(node.initializer) &&
      node.initializer.text === propsName
    ) {
      for (const element of node.name.elements) {
        if (element.dotDotDotToken) {
          restProps.push({ name: element.name.getText(), source: "destructure" });
        }
      }
      return;
    }
    ts.forEachChild(node, visit);
  };
  ts.forEachChild(body, visit);
  return restProps.sort(byName);
}

function readsSxProp(
  parameter: ts.ParameterDeclaration | undefined,
  body: ts.ConciseBody | undefined,
): boolean {
  if (parameter?.name && ts.isObjectBindingPattern(parameter.name)) {
    if (bindingPatternHasName(parameter.name, "sx")) {
      return true;
    }
  }
  if (!body || !parameter?.name || !ts.isIdentifier(parameter.name)) {
    return false;
  }
  const propsName = parameter.name.text;
  let found = false;
  const visit = (node: ts.Node): void => {
    if (found) {
      return;
    }
    if (
      isFunctionWithParameterNamed(node, propsName) ||
      isFunctionWithParameterDestructuringName(node, "sx")
    ) {
      return;
    }
    if (
      ts.isPropertyAccessExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === propsName &&
      node.name.text === "sx"
    ) {
      found = true;
      return;
    }
    if (
      ts.isVariableDeclaration(node) &&
      ts.isObjectBindingPattern(node.name) &&
      node.initializer &&
      isIdentifierNamed(unwrapExpression(node.initializer), propsName) &&
      bindingPatternHasName(node.name, "sx")
    ) {
      found = true;
      return;
    }
    ts.forEachChild(node, visit);
  };
  ts.forEachChild(body, visit);
  return found;
}

function detectSxTarget(
  parameter: ts.ParameterDeclaration | undefined,
  body: ts.ConciseBody | undefined,
): "root" | "inner" | undefined {
  if (!body) {
    return undefined;
  }
  const sxNames = collectSxBindingNames(parameter, body);
  if (sxNames.size === 0) {
    return undefined;
  }
  const sxPropContainerNames = collectSxPropContainerNames(parameter);
  const sxPropsNames = collectStylexPropsBindingNames(body, sxNames, sxPropContainerNames);
  const root = returnedJsxRoot(body);
  if (!root) {
    return undefined;
  }
  if (jsxOpeningUsesSx(jsxRootOpening(root), sxNames, sxPropsNames, sxPropContainerNames)) {
    return "root";
  }
  return jsxChildrenUseSx(root, sxNames, sxPropsNames, sxPropContainerNames) ? "inner" : undefined;
}

function collectSxBindingNames(
  parameter: ts.ParameterDeclaration | undefined,
  body: ts.ConciseBody,
): Set<string> {
  const names = new Set<string>();
  if (parameter?.name && ts.isObjectBindingPattern(parameter.name)) {
    collectBindingElementLocalNames(parameter.name, "sx", names);
  } else {
    names.add("sx");
  }
  if (parameter?.name && ts.isIdentifier(parameter.name)) {
    const propsName = parameter.name.text;
    const visit = (node: ts.Node): void => {
      if (
        ts.isVariableDeclaration(node) &&
        ts.isObjectBindingPattern(node.name) &&
        node.initializer &&
        isIdentifierNamed(unwrapExpression(node.initializer), propsName)
      ) {
        collectBindingElementLocalNames(node.name, "sx", names);
      }
      ts.forEachChild(node, visit);
    };
    ts.forEachChild(body, visit);
  }
  return names;
}

function collectBindingElementLocalNames(
  pattern: ts.ObjectBindingPattern,
  propertyName: string,
  names: Set<string>,
): void {
  for (const element of pattern.elements) {
    const name = bindingElementPropertyNameText(element);
    if (name === propertyName && ts.isIdentifier(element.name)) {
      names.add(element.name.text);
    }
  }
}

function collectSxPropContainerNames(parameter: ts.ParameterDeclaration | undefined): Set<string> {
  const names = new Set<string>();
  if (parameter?.name && ts.isIdentifier(parameter.name)) {
    names.add(parameter.name.text);
  }
  return names;
}

function bindingElementPropertyNameText(element: ts.BindingElement): string | null {
  if (element.propertyName) {
    return ts.isIdentifier(element.propertyName) || ts.isStringLiteral(element.propertyName)
      ? element.propertyName.text
      : null;
  }
  return ts.isIdentifier(element.name) ? element.name.text : null;
}

function collectStylexPropsBindingNames(
  body: ts.ConciseBody,
  sxNames: ReadonlySet<string>,
  sxPropContainerNames: ReadonlySet<string>,
): Set<string> {
  const names = new Set<string>();
  const visit = (node: ts.Node): void => {
    if (
      ts.isVariableDeclaration(node) &&
      node.initializer &&
      isStylexPropsCallWithSx(node.initializer, sxNames, sxPropContainerNames)
    ) {
      if (ts.isIdentifier(node.name)) {
        names.add(node.name.text);
      } else if (ts.isObjectBindingPattern(node.name)) {
        collectBindingPatternIdentifierNames(node.name, names);
      }
    }
    ts.forEachChild(node, visit);
  };
  ts.forEachChild(body, visit);
  return names;
}

function collectBindingPatternIdentifierNames(
  pattern: ts.ObjectBindingPattern,
  names: Set<string>,
): void {
  for (const element of pattern.elements) {
    if (ts.isIdentifier(element.name)) {
      names.add(element.name.text);
    }
  }
}

function isStylexPropsCallWithSx(
  expr: ts.Expression,
  sxNames: ReadonlySet<string>,
  sxPropContainerNames: ReadonlySet<string>,
): boolean {
  const unwrapped = unwrapExpression(expr);
  const noSxPropsNames = new Set<string>();
  return (
    ts.isCallExpression(unwrapped) &&
    isStylexPropsCallee(unwrapped.expression) &&
    unwrapped.arguments.some((arg) =>
      expressionReferencesNames(arg, sxNames, noSxPropsNames, sxPropContainerNames),
    )
  );
}

function isStylexPropsCallee(expr: ts.Expression): boolean {
  return (
    ts.isPropertyAccessExpression(expr) &&
    expr.name.text === "props" &&
    ts.isIdentifier(expr.expression) &&
    expr.expression.text === "stylex"
  );
}

type JsxRoot = ts.JsxElement | ts.JsxSelfClosingElement;

function returnedJsxRoot(body: ts.ConciseBody): JsxRoot | null {
  if (ts.isJsxElement(body) || ts.isJsxSelfClosingElement(body)) {
    return body;
  }
  if (!ts.isBlock(body)) {
    return null;
  }
  for (const statement of body.statements) {
    if (!ts.isReturnStatement(statement) || !statement.expression) {
      continue;
    }
    const expr = unwrapExpression(statement.expression);
    if (ts.isJsxElement(expr) || ts.isJsxSelfClosingElement(expr)) {
      return expr;
    }
  }
  return null;
}

function jsxChildrenUseSx(
  root: JsxRoot,
  sxNames: ReadonlySet<string>,
  sxPropsNames: ReadonlySet<string>,
  sxPropContainerNames: ReadonlySet<string>,
): boolean {
  if (!ts.isJsxElement(root)) {
    return false;
  }
  let found = false;
  const visit = (node: ts.Node): void => {
    if (found) {
      return;
    }
    if (functionShadowsSxReference(node, sxNames, sxPropContainerNames)) {
      return;
    }
    if (
      (ts.isJsxElement(node) &&
        jsxOpeningUsesSx(node.openingElement, sxNames, sxPropsNames, sxPropContainerNames)) ||
      (ts.isJsxSelfClosingElement(node) &&
        jsxOpeningUsesSx(node, sxNames, sxPropsNames, sxPropContainerNames))
    ) {
      found = true;
      return;
    }
    ts.forEachChild(node, visit);
  };
  for (const child of root.children) {
    visit(child);
  }
  return found;
}

function jsxRootOpening(root: JsxRoot): ts.JsxOpeningLikeElement {
  return ts.isJsxElement(root) ? root.openingElement : root;
}

function jsxOpeningUsesSx(
  opening: ts.JsxOpeningLikeElement,
  sxNames: ReadonlySet<string>,
  sxPropsNames: ReadonlySet<string>,
  sxPropContainerNames: ReadonlySet<string>,
): boolean {
  return opening.attributes.properties.some((attribute) => {
    if (ts.isJsxSpreadAttribute(attribute)) {
      return expressionReferencesNames(
        attribute.expression,
        sxNames,
        sxPropsNames,
        sxPropContainerNames,
      );
    }
    if (!ts.isIdentifier(attribute.name) || !attribute.initializer) {
      return false;
    }
    if (!ts.isJsxExpression(attribute.initializer) || !attribute.initializer.expression) {
      return false;
    }
    if (attribute.name.text === "className" || attribute.name.text === "style") {
      return expressionReferencesStylexPropsBinding(attribute.initializer.expression, sxPropsNames);
    }
    if (attribute.name.text !== "sx") {
      return false;
    }
    return expressionReferencesNames(
      attribute.initializer.expression,
      sxNames,
      sxPropsNames,
      sxPropContainerNames,
    );
  });
}

function expressionReferencesStylexPropsBinding(
  expr: ts.Expression,
  sxPropsNames: ReadonlySet<string>,
): boolean {
  const unwrapped = unwrapExpression(expr);
  return ts.isIdentifier(unwrapped) && sxPropsNames.has(unwrapped.text);
}

function expressionReferencesNames(
  expr: ts.Expression,
  sxNames: ReadonlySet<string>,
  sxPropsNames: ReadonlySet<string>,
  sxPropContainerNames: ReadonlySet<string>,
): boolean {
  const unwrapped = unwrapExpression(expr);
  if (ts.isIdentifier(unwrapped)) {
    return sxNames.has(unwrapped.text) || sxPropsNames.has(unwrapped.text);
  }
  if (
    ts.isPropertyAccessExpression(unwrapped) &&
    unwrapped.name.text === "sx" &&
    ts.isIdentifier(unwrapped.expression)
  ) {
    return sxPropContainerNames.has(unwrapped.expression.text);
  }
  return isStylexPropsCallWithSx(unwrapped, sxNames, sxPropContainerNames);
}

function functionShadowsSxReference(
  node: ts.Node,
  sxNames: ReadonlySet<string>,
  sxPropContainerNames: ReadonlySet<string>,
): boolean {
  if (!isFunctionWithParameters(node)) {
    return false;
  }
  for (const name of sxPropContainerNames) {
    if (node.parameters.some((parameter) => isBindingNameNamed(parameter.name, name))) {
      return true;
    }
  }
  for (const name of sxNames) {
    if (node.parameters.some((parameter) => isBindingNameNamed(parameter.name, name))) {
      return true;
    }
  }
  return node.parameters.some(
    (parameter) =>
      ts.isObjectBindingPattern(parameter.name) && bindingPatternHasName(parameter.name, "sx"),
  );
}

function isFunctionWithParameterNamed(node: ts.Node, name: string): boolean {
  return isFunctionWithParameters(node)
    ? node.parameters.some((parameter) => isBindingNameNamed(parameter.name, name))
    : false;
}

function isFunctionWithParameterDestructuringName(node: ts.Node, name: string): boolean {
  return isFunctionWithParameters(node)
    ? node.parameters.some(
        (parameter) =>
          ts.isObjectBindingPattern(parameter.name) && bindingPatternHasName(parameter.name, name),
      )
    : false;
}

function isFunctionWithParameters(
  node: ts.Node,
): node is
  | ts.FunctionDeclaration
  | ts.FunctionExpression
  | ts.ArrowFunction
  | ts.MethodDeclaration {
  return (
    ts.isFunctionDeclaration(node) ||
    ts.isFunctionExpression(node) ||
    ts.isArrowFunction(node) ||
    ts.isMethodDeclaration(node)
  );
}

function isBindingNameNamed(name: ts.BindingName, expected: string): boolean {
  return ts.isIdentifier(name) && name.text === expected;
}

function bindingPatternHasName(pattern: ts.ObjectBindingPattern, name: string): boolean {
  return pattern.elements.some((element) => element.name.getText() === name);
}

function unwrapExpression(expression: ts.Expression): ts.Expression {
  let current = expression;
  while (
    ts.isAsExpression(current) ||
    ts.isTypeAssertionExpression(current) ||
    ts.isSatisfiesExpression(current) ||
    ts.isParenthesizedExpression(current)
  ) {
    current = current.expression;
  }
  return current;
}

function isIdentifierNamed(expression: ts.Expression, name: string): boolean {
  return ts.isIdentifier(expression) && expression.text === name;
}

function describeTypeNode(typeNode: ts.TypeNode, checker: ts.TypeChecker): TypeScriptTypeMetadata {
  const declaration = resolveTypeDeclaration(typeNode, checker);
  return {
    text: typeNode.getText(),
    inheritedTypes: declaration ? readInheritedTypes(declaration) : [],
    intersectionTypes: readIntersectionTypes(typeNode, declaration),
    unionTypes: readUnionTypes(typeNode, declaration),
  };
}

function resolveTypeDeclaration(
  typeNode: ts.TypeNode,
  checker: ts.TypeChecker,
): ts.Declaration | undefined {
  if (!ts.isTypeReferenceNode(typeNode)) {
    return undefined;
  }
  const symbol = checker.getSymbolAtLocation(typeNode.typeName);
  return symbol?.declarations?.[0];
}

function readInheritedTypes(declaration: ts.Declaration): string[] {
  if (!ts.isInterfaceDeclaration(declaration) || !declaration.heritageClauses) {
    return [];
  }
  return declaration.heritageClauses.flatMap((clause) =>
    clause.types.map((heritageType) => heritageType.getText()),
  );
}

function readIntersectionTypes(
  typeNode: ts.TypeNode,
  declaration: ts.Declaration | undefined,
): string[] {
  if (ts.isIntersectionTypeNode(typeNode)) {
    return typeNode.types.map((node) => node.getText());
  }
  if (
    declaration &&
    ts.isTypeAliasDeclaration(declaration) &&
    ts.isIntersectionTypeNode(declaration.type)
  ) {
    return declaration.type.types.map((node) => node.getText());
  }
  return [];
}

function readUnionTypes(typeNode: ts.TypeNode, declaration: ts.Declaration | undefined): string[] {
  if (ts.isUnionTypeNode(typeNode)) {
    return typeNode.types.map((node) => node.getText());
  }
  if (
    declaration &&
    ts.isTypeAliasDeclaration(declaration) &&
    ts.isUnionTypeNode(declaration.type)
  ) {
    return declaration.type.types.map((node) => node.getText());
  }
  return [];
}

function findStyledPropsTypeNode(node: ts.Expression): ts.TypeNode | undefined {
  if (ts.isTaggedTemplateExpression(node)) {
    return node.typeArguments?.[0] ?? findStyledPropsTypeNode(node.tag);
  }
  if (ts.isCallExpression(node)) {
    return node.typeArguments?.[0] ?? findStyledPropsTypeNode(node.expression);
  }
  if (ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node)) {
    return findStyledPropsTypeNode(node.expression);
  }
  return undefined;
}

type ComponentFunctionInitializerInfo = {
  fn: ts.FunctionDeclaration | ts.ArrowFunction | ts.FunctionExpression;
  propTypeNode?: ts.TypeNode;
};

function collectLocalFunctionInitializers(
  sourceFile: ts.SourceFile,
): Map<string, ComponentFunctionInitializerInfo> {
  const initializers = new Map<string, ComponentFunctionInitializerInfo>();
  for (const statement of sourceFile.statements) {
    const declaration =
      ts.isExportDeclaration(statement) || ts.isExportAssignment(statement) ? undefined : statement;
    if (declaration && ts.isFunctionDeclaration(declaration) && declaration.name) {
      initializers.set(declaration.name.text, {
        fn: declaration,
        propTypeNode: declaration.parameters[0]?.type,
      });
      continue;
    }
    if (!declaration || !ts.isVariableStatement(declaration)) {
      continue;
    }
    for (const variableDeclaration of declaration.declarationList.declarations) {
      if (
        ts.isIdentifier(variableDeclaration.name) &&
        variableDeclaration.initializer &&
        (ts.isArrowFunction(variableDeclaration.initializer) ||
          ts.isFunctionExpression(variableDeclaration.initializer))
      ) {
        initializers.set(variableDeclaration.name.text, {
          fn: variableDeclaration.initializer,
          propTypeNode: variableDeclaration.initializer.parameters[0]?.type,
        });
      }
    }
  }
  return initializers;
}

function getComponentFunctionInitializerInfo(
  node: ts.Expression,
  localFunctionInitializers: ReadonlyMap<string, ComponentFunctionInitializerInfo>,
): ComponentFunctionInitializerInfo | undefined {
  if (ts.isArrowFunction(node) || ts.isFunctionExpression(node)) {
    return { fn: node };
  }
  if (!ts.isCallExpression(node) || !isKnownPropPreservingHocCallee(node.expression)) {
    return undefined;
  }
  for (const arg of node.arguments) {
    if (ts.isArrowFunction(arg) || ts.isFunctionExpression(arg)) {
      return { fn: arg, propTypeNode: getHocPropsTypeNode(node) };
    }
    if (ts.isIdentifier(arg)) {
      const local = localFunctionInitializers.get(arg.text);
      if (local) {
        return { ...local, propTypeNode: getHocPropsTypeNode(node) ?? local.propTypeNode };
      }
      continue;
    }
    const nested = getComponentFunctionInitializerInfo(
      arg as ts.Expression,
      localFunctionInitializers,
    );
    if (nested) {
      return { ...nested, propTypeNode: nested.propTypeNode ?? getHocPropsTypeNode(node) };
    }
  }
  return undefined;
}

function getHocPropsTypeNode(node: ts.CallExpression): ts.TypeNode | undefined {
  const calleeName = ts.isPropertyAccessExpression(node.expression)
    ? node.expression.name.text
    : ts.isIdentifier(node.expression)
      ? node.expression.text
      : undefined;
  if (calleeName !== "forwardRef") {
    return undefined;
  }
  return node.typeArguments?.[1];
}

/**
 * Names of HOCs that wrap a React component and preserve the original prop
 * type, so the wrapped function expression's props are still accurate metadata
 * for the resulting component. Without this list the prepass loses prop info
 * for components defined as `someHoc(function X(props) { ... })`, which
 * downstream means the codemod can't decide whether to lift className/style
 * and emits destructures that produce TS2339.
 *
 * `memo` and `forwardRef` come from React. `observer` is matched as a bare
 * identifier because it's the conventional name for the most common
 * third-party prop-preserving HOC seen in the wild; teams using a different
 * name can wire in additional matchers via a future adapter hook.
 */
const KNOWN_PROP_PRESERVING_HOC_NAMES = new Set(["memo", "forwardRef", "observer"]);

function isKnownPropPreservingHocCallee(node: ts.Expression): boolean {
  if (ts.isIdentifier(node)) {
    return KNOWN_PROP_PRESERVING_HOC_NAMES.has(node.text);
  }
  return ts.isPropertyAccessExpression(node) && KNOWN_PROP_PRESERVING_HOC_NAMES.has(node.name.text);
}

function isStyledComponentInitializer(node: ts.Expression): boolean {
  if (ts.isTaggedTemplateExpression(node)) {
    return isStyledTag(node.tag);
  }
  return false;
}

function isStyledTag(node: ts.Expression): boolean {
  if (ts.isIdentifier(node)) {
    return node.text === "styled";
  }
  if (ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node)) {
    return isStyledTag(node.expression);
  }
  if (ts.isCallExpression(node)) {
    return isStyledTag(node.expression);
  }
  return false;
}

function isReactComponentFunction(node: ts.FunctionDeclaration, checker: ts.TypeChecker): boolean {
  return Boolean((node.name && isReactComponentName(node.name.text)) || returnsJsx(node, checker));
}

function returnsJsx(node: ts.FunctionLikeDeclaration, checker?: ts.TypeChecker): boolean {
  if (node.type) {
    const returnText = node.type.getText();
    if (
      /\b(JSX\.Element|ReactElement|React\.ReactElement|ReactNode|React\.ReactNode)\b/.test(
        returnText,
      )
    ) {
      return true;
    }
  }
  // The previous implementation also consulted the type checker
  // (`getReturnTypeOfSignature` + `typeToString` testing for Element/ReactElement
  // /ReactNode) to detect functions that return JSX through type inference
  // without containing a literal JSX node. That code path dominated the prepass
  // at ~2.3s for ~3900 calls. In practice every component this matters for has
  // an inline JSX literal somewhere — the syntactic walk below catches them —
  // and components that only return a value typed as ReactNode are typically
  // pass-through helpers that don't get styled-component-wrapped. Skipping the
  // checker call keeps the metadata sufficient for our consumers while
  // eliminating the cost.
  void checker;
  let found = false;
  const visit = (child: ts.Node): void => {
    if (found) {
      return;
    }
    if (ts.isJsxElement(child) || ts.isJsxFragment(child) || ts.isJsxSelfClosingElement(child)) {
      found = true;
      return;
    }
    ts.forEachChild(child, visit);
  };
  if (node.body) {
    ts.forEachChild(node.body, visit);
  }
  return found;
}

function readTypeParameters(
  typeParameters: ts.NodeArray<ts.TypeParameterDeclaration> | undefined,
): string[] {
  return typeParameters?.map((param) => param.getText()) ?? [];
}

function readParameterName(name: ts.BindingName): string {
  if (ts.isIdentifier(name)) {
    return name.text;
  }
  return name.getText();
}

function isReadonlyProperty(symbol: ts.Symbol): boolean {
  return Boolean(
    symbol.declarations?.some(
      (declaration) =>
        (ts.isPropertySignature(declaration) || ts.isPropertyDeclaration(declaration)) &&
        declaration.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ReadonlyKeyword),
    ),
  );
}

function getExportedNames(sourceFile: ts.SourceFile, checker: ts.TypeChecker): Set<string> {
  const moduleSymbol = checker.getSymbolAtLocation(sourceFile);
  if (!moduleSymbol) {
    return new Set();
  }
  return new Set(checker.getExportsOfModule(moduleSymbol).map((symbol) => symbol.getName()));
}

function getDefaultExportedLocalNames(sourceFile: ts.SourceFile): Set<string> {
  const names = new Set<string>();
  for (const statement of sourceFile.statements) {
    if (!ts.isExportAssignment(statement) || !ts.isIdentifier(statement.expression)) {
      continue;
    }
    names.add(statement.expression.text);
  }
  return names;
}

function isExported(node: ts.Node): boolean {
  return Boolean(
    ts.canHaveModifiers(node) &&
    ts.getModifiers(node)?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword),
  );
}

function isDefaultExport(node: ts.Node): boolean {
  return Boolean(
    ts.canHaveModifiers(node) &&
    ts.getModifiers(node)?.some((modifier) => modifier.kind === ts.SyntaxKind.DefaultKeyword),
  );
}

function isReactComponentName(name: string): boolean {
  return /^[A-Z]/.test(name);
}

function createProgram(rootNames: readonly string[], cwd: string): ts.Program {
  const configPath = findTsConfig(rootNames, cwd);
  const options = configPath ? readCompilerOptions(configPath) : defaultCompilerOptions();
  return ts.createProgram({
    rootNames: [...rootNames],
    options: {
      ...options,
      allowJs: true,
      checkJs: false,
      noEmit: true,
      skipLibCheck: true,
      skipDefaultLibCheck: true,
      // The prepass only needs structural prop-shape metadata; we don't run
      // type-checking and never emit. Skipping global @types packages saves
      // Program-construction time on large apps where the project tsconfig
      // pulls in many ambient type packages (node, react, framework-specific
      // declarations) that take seconds to parse. Override `types: []` to
      // suppress automatic inclusion. `lib` is left untouched so DOM / React
      // intrinsic type references (HTMLAttributes etc.) still resolve.
      types: [],
    },
  });
}

function readCompilerOptions(configPath: string): ts.CompilerOptions {
  const config = ts.readConfigFile(configPath, (filePath) => ts.sys.readFile(filePath));
  if (config.error) {
    return defaultCompilerOptions();
  }
  const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, path.dirname(configPath));
  return parsed.options;
}

function defaultCompilerOptions(): ts.CompilerOptions {
  return {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Node10,
    jsx: ts.JsxEmit.ReactJSX,
    esModuleInterop: true,
    skipLibCheck: true,
  };
}

function findTsConfig(rootNames: readonly string[], cwd: string): string | undefined {
  const start = rootNames.length > 0 ? path.dirname(rootNames[0]!) : cwd;
  return (
    ts.findConfigFile(start, (filePath) => ts.sys.fileExists(filePath), "tsconfig.json") ??
    undefined
  );
}

function normalizeFilePaths(files: readonly string[]): string[] {
  return [...new Set(files.map(resolveExistingFilePath))].sort();
}

function normalizeFilePath(filePath: string): string {
  return resolveExistingFilePath(filePath);
}

function isTypeScriptLikeFile(filePath: string): boolean {
  return /\.(tsx?|jsx?)$/.test(filePath);
}

function byName<T extends { name: string }>(a: T, b: T): number {
  return a.name.localeCompare(b.name);
}

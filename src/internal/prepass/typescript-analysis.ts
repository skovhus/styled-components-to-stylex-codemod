import { existsSync, realpathSync } from "node:fs";
import path from "node:path";
import ts from "typescript";

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
  const files = program
    .getSourceFiles()
    .filter((sourceFile) => rootNameSet.has(path.resolve(sourceFile.fileName)))
    .map((sourceFile) => analyzeSourceFile(sourceFile, checker))
    .filter((file) => file.components.length > 0 || file.functions.length > 0)
    .sort((a, b) => a.filePath.localeCompare(b.filePath));

  return { version: 1, files };
}

export function findTypeScriptComponentMetadata(
  metadata: TypeScriptPrepassMetadata | undefined,
  filePath: string,
  componentNames: readonly string[],
): TypeScriptComponentMetadata | undefined {
  if (!metadata) {
    return undefined;
  }
  const names = new Set(componentNames);
  const resolvedFilePath = resolveExistingFilePath(filePath);
  return metadata.files
    .find((file) => file.filePath === resolvedFilePath)
    ?.components.find((component) => names.has(component.name));
}

function analyzeSourceFile(
  sourceFile: ts.SourceFile,
  checker: ts.TypeChecker,
): TypeScriptFileMetadata {
  const exportedNames = getExportedNames(sourceFile, checker);
  const components: TypeScriptComponentMetadata[] = [];
  const functions: TypeScriptFunctionMetadata[] = [];

  const visit = (node: ts.Node): void => {
    if (ts.isFunctionDeclaration(node) && node.name) {
      const fn = readFunctionDeclaration(node, checker, exportedNames);
      functions.push(fn);
      if (isReactComponentFunction(node, checker)) {
        components.push(readReactComponentFromFunction(node, checker, exportedNames));
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
        if (
          declaration.initializer &&
          (ts.isArrowFunction(declaration.initializer) ||
            ts.isFunctionExpression(declaration.initializer))
        ) {
          functions.push(
            readVariableFunction(declaration.name.text, declaration.initializer, node, checker),
          );
          if (isReactComponentName(declaration.name.text) || returnsJsx(declaration.initializer)) {
            components.push(
              readReactComponentFromVariable(
                declaration.name.text,
                declaration.initializer,
                node,
                checker,
                exportedNames,
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
  node: ts.ArrowFunction | ts.FunctionExpression,
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
): TypeScriptComponentMetadata {
  const name = node.name?.text ?? "default";
  return buildComponentMetadata({
    name,
    kind: "react",
    exported: exportedNames.has(name),
    defaultExport: isDefaultExport(node),
    typeParameters: readTypeParameters(node.typeParameters),
    propTypeNode: node.parameters[0]?.type,
    parameters: readParameters(node.parameters, checker),
    restProps: readRestProps(node.parameters[0], node.body),
    checker,
    location: node,
  });
}

function readReactComponentFromVariable(
  name: string,
  node: ts.ArrowFunction | ts.FunctionExpression,
  statement: ts.VariableStatement,
  checker: ts.TypeChecker,
  exportedNames: ReadonlySet<string>,
): TypeScriptComponentMetadata {
  return buildComponentMetadata({
    name,
    kind: "react",
    exported: exportedNames.has(name) || isExported(statement),
    defaultExport: false,
    typeParameters: readTypeParameters(node.typeParameters),
    propTypeNode: node.parameters[0]?.type,
    parameters: readParameters(node.parameters, checker),
    restProps: readRestProps(node.parameters[0], node.body),
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
  checker: ts.TypeChecker;
  location: ts.Node;
}): TypeScriptComponentMetadata {
  const propType = args.propTypeNode ? args.checker.getTypeFromTypeNode(args.propTypeNode) : null;
  const props = propType ? readPropsFromType(propType, args.checker, args.location) : [];
  const explicitPropNames = args.propTypeNode
    ? collectExplicitPropNames(args.propTypeNode, args.checker)
    : [];
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
    supportsSxProp: explicitPropNames.includes("sx"),
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
      const propType = checker.getTypeOfSymbolAtLocation(symbol, declaration);
      return {
        name: symbol.getName(),
        optional: (symbol.flags & ts.SymbolFlags.Optional) !== 0,
        readonly: isReadonlyProperty(symbol),
        type: checker.typeToString(propType, location, ts.TypeFormatFlags.NoTruncation),
      };
    })
    .sort(byName);
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

  const symbol = checker.getSymbolAtLocation(typeNode.typeName);
  for (const declaration of symbol?.declarations ?? []) {
    collectExplicitPropNamesFromDeclaration(names, declaration, checker, visited);
  }
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
      collectExplicitPropNamesInto(names, heritageType, checker, visited);
    }
  }
}

function isIntrinsicReactPropReference(typeNode: ts.TypeReferenceNode): boolean {
  const typeName = typeNode.typeName.getText();
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
  return Boolean(node.name && (isReactComponentName(node.name.text) || returnsJsx(node, checker)));
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
  if (checker) {
    const signature = checker.getSignatureFromDeclaration(node);
    if (signature) {
      const returnType = checker.typeToString(checker.getReturnTypeOfSignature(signature), node);
      if (/\b(Element|ReactElement|ReactNode)\b/.test(returnType)) {
        return true;
      }
    }
  }
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

function resolveExistingFilePath(filePath: string): string {
  const resolved = path.resolve(filePath);
  if (!existsSync(resolved)) {
    return resolved;
  }
  try {
    return realpathSync(resolved);
  } catch {
    return resolved;
  }
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

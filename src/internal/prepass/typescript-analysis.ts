import path from "node:path";
import ts from "typescript";
import {
  collectExplicitPropNames,
  collectSxAllowedProperties,
  collectSxExcludedProperties,
  typeNodeHasResolvableSxSurface,
} from "./prop-name-collection.js";
import { detectSxTarget, readsSxProp } from "./sx-target-detection.js";
import {
  createProgram,
  getDefaultExportedLocalNames,
  getExportedNames,
  isTypeScriptLikeFile,
  normalizeFilePath,
  normalizeFilePaths,
} from "./ts-program-setup.js";

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

function byName<T extends { name: string }>(a: T, b: T): number {
  return a.name.localeCompare(b.name);
}

import ts from "typescript";
import {
  bindingElementPropertyNameText,
  bindingPatternHasName,
  isIdentifierNamed,
  unwrapExpression,
} from "./ts-ast-shared.js";

export function readsSxProp(
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

export function detectSxTarget(
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

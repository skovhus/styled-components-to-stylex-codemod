/**
 * Interpolation Classifier
 *
 * Classifies interpolation expressions in styled-components template literals
 * to determine how they should be transformed to StyleX.
 */

import type { ASTNode } from "jscodeshift";
import type { ClassificationResult, HelperInfo } from "../plugin.js";

// Use jscodeshift's AST types which are compatible with @babel/types
// We define a namespace to match the @babel/types naming convention
// eslint-disable-next-line @typescript-eslint/no-namespace
namespace t {
  export type Node = ASTNode;
  export type Expression = ASTNode;
  export type ArrowFunctionExpression = ASTNode & {
    type: "ArrowFunctionExpression";
    body: ASTNode;
    params: ASTNode[];
  };
  export type CallExpression = ASTNode & {
    type: "CallExpression";
    callee: ASTNode;
    arguments: ASTNode[];
  };
  export type Identifier = ASTNode & { type: "Identifier"; name: string };
  export type ConditionalExpression = ASTNode & {
    type: "ConditionalExpression";
    test: ASTNode;
    consequent: ASTNode;
    alternate: ASTNode;
  };
  export type LogicalExpression = ASTNode & {
    type: "LogicalExpression";
    operator: string;
    left: ASTNode;
    right: ASTNode;
  };
  export type TemplateLiteral = ASTNode & {
    type: "TemplateLiteral";
    quasis: Array<{ value: { cooked: string | null; raw: string } }>;
    expressions: ASTNode[];
  };
  export type MemberExpression = ASTNode & {
    type: "MemberExpression";
    object: ASTNode;
    property: ASTNode;
  };
  export type StringLiteral = ASTNode & { type: "StringLiteral"; value: string };
  export type NumericLiteral = ASTNode & { type: "NumericLiteral"; value: number };
  export type BooleanLiteral = ASTNode & { type: "BooleanLiteral"; value: boolean };
  export type BinaryExpression = ASTNode & { type: "BinaryExpression" };
  export type UnaryExpression = ASTNode & {
    type: "UnaryExpression";
    operator: string;
    argument: ASTNode;
  };
  export type SpreadElement = ASTNode & { type: "SpreadElement" };
}

// ============================================================================
// Main Classifier
// ============================================================================

/**
 * Classify an interpolation expression
 */
export function classifyInterpolation(
  expr: t.Expression,
  contextHint: string,
): ClassificationResult {
  // Arrow function: (props) => props.theme.x
  if (isArrowFunctionExpression(expr)) {
    return classifyArrowFunction(expr);
  }

  // Function call: color('primary'), truncate()
  if (isCallExpression(expr)) {
    return classifyCallExpression(expr);
  }

  // Identifier: ${rotate} (keyframes), ${Link} (component), ${truncate} (css)
  if (isIdentifier(expr)) {
    return classifyIdentifier(expr, contextHint);
  }

  // Conditional: condition ? 'a' : 'b'
  if (isConditionalExpression(expr)) {
    return classifyConditional(expr);
  }

  // Logical: condition && 'styles'
  if (isLogicalExpression(expr)) {
    return classifyLogical(expr);
  }

  // Template literal: `${size}px`
  if (isTemplateLiteral(expr)) {
    return classifyTemplateLiteral(expr);
  }

  // Member expression: theme.colors.primary
  if (isMemberExpression(expr)) {
    return classifyMemberExpression(expr);
  }

  // Literal: 16, '16px'
  if (isLiteral(expr)) {
    return { type: "literal", value: extractLiteralValue(expr) };
  }

  // Binary expression: spacing / 2
  if (isBinaryExpression(expr)) {
    return { type: "interpolation", expression: expr };
  }

  // Default: treat as generic interpolation
  return { type: "interpolation", expression: expr };
}

// ============================================================================
// Arrow Function Classification
// ============================================================================

function classifyArrowFunction(
  expr: t.ArrowFunctionExpression,
): ClassificationResult {
  const body = expr.body;
  const param = expr.params[0];

  // Simple theme access: props => props.theme.x
  if (isMemberExpression(body)) {
    const path = extractMemberPath(body);

    // Theme access: props.theme.colors.primary
    if (path[0] === "props" && path[1] === "theme") {
      return {
        type: "theme",
        accessPath: path.slice(2),
        expression: expr,
      };
    }

    // Direct prop access: props.$primary
    if (path[0] === "props" && path[1]?.startsWith("$")) {
      return {
        type: "prop",
        propName: path[1],
        expression: expr,
      };
    }

    // props.propName (non-transient)
    if (path[0] === "props" && path.length === 2) {
      return {
        type: "prop",
        propName: path[1]!,
        expression: expr,
      };
    }
  }

  // Ternary: props => props.$x ? 'a' : 'b'
  if (isConditionalExpression(body)) {
    return classifyPropConditional(body, param);
  }

  // Logical: props => props.$x && 'styles'
  if (isLogicalExpression(body)) {
    return classifyPropLogical(body, param);
  }

  // Function call in body: props => getColor(props.variant)
  if (isCallExpression(body)) {
    return { type: "interpolation", expression: expr };
  }

  return { type: "interpolation", expression: expr };
}

function classifyPropConditional(
  expr: t.ConditionalExpression,
  param: t.Node | undefined,
): ClassificationResult {
  const test = expr.test;
  const consequent = expr.consequent;
  const alternate = expr.alternate;

  // Check if condition is a prop access
  const propName = extractPropNameFromCondition(test);
  if (propName) {
    const consequentValue = extractStaticValue(consequent);
    const alternateValue = extractStaticValue(alternate);

    if (consequentValue !== null && alternateValue !== null) {
      return {
        type: "prop-conditional",
        propName,
        consequent: String(consequentValue),
        alternate: String(alternateValue),
        expression: wrapInArrowIfNeeded(expr, param),
      };
    }
  }

  return {
    type: "interpolation",
    expression: wrapInArrowIfNeeded(expr, param),
  };
}

function classifyPropLogical(
  expr: t.LogicalExpression,
  param: t.Node | undefined,
): ClassificationResult {
  if (expr.operator !== "&&") {
    return {
      type: "interpolation",
      expression: wrapInArrowIfNeeded(expr, param),
    };
  }

  const propName = extractPropNameFromCondition(expr.left);
  if (propName) {
    const value = extractStaticValue(expr.right);
    if (value !== null) {
      return {
        type: "prop-logical",
        propName,
        value: String(value),
        expression: wrapInArrowIfNeeded(expr, param),
      };
    }
  }

  return {
    type: "interpolation",
    expression: wrapInArrowIfNeeded(expr, param),
  };
}

// ============================================================================
// Call Expression Classification
// ============================================================================

function classifyCallExpression(expr: t.CallExpression): ClassificationResult {
  const callee = expr.callee;

  // Named helper: color('primary'), truncate()
  if (isIdentifier(callee)) {
    const args: t.Expression[] = [];
    for (const arg of expr.arguments) {
      if (!isSpreadElement(arg)) {
        args.push(arg as t.Expression);
      }
    }
    
    const helperInfo: HelperInfo = {
      name: callee.name,
      args,
      callExpression: expr,
    };

    return {
      type: "helper",
      helperInfo,
      expression: expr,
    };
  }

  return { type: "interpolation", expression: expr };
}

// ============================================================================
// Identifier Classification
// ============================================================================

function classifyIdentifier(
  expr: t.Identifier,
  contextHint: string,
): ClassificationResult {
  const name = expr.name;

  // Context-based classification
  // If we're in a full-rule context, it's likely a css`` reference
  if (contextHint === "full-rule") {
    return {
      type: "css-ref",
      name,
      expression: expr,
    };
  }

  // If we're in a value context and it looks like a keyframes name
  // (this is a heuristic - actual detection would need scope analysis)
  if (contextHint === "value") {
    // Could be keyframes or a variable - we'll mark as keyframes-ref
    // and let the transform verify by checking the variable declaration
    return {
      type: "keyframes-ref",
      name,
      expression: expr,
    };
  }

  // If we're in a selector context, it's likely a component reference
  if (contextHint === "selector") {
    return {
      type: "component-ref",
      name,
      expression: expr,
    };
  }

  // Default to generic interpolation
  return { type: "interpolation", expression: expr };
}

// ============================================================================
// Other Expression Classification
// ============================================================================

function classifyConditional(
  expr: t.ConditionalExpression,
): ClassificationResult {
  // Top-level conditional without props context
  const consequentValue = extractStaticValue(expr.consequent);
  const alternateValue = extractStaticValue(expr.alternate);

  if (consequentValue !== null && alternateValue !== null) {
    // This is a static conditional based on a constant
    return { type: "interpolation", expression: expr };
  }

  return { type: "interpolation", expression: expr };
}

function classifyLogical(expr: t.LogicalExpression): ClassificationResult {
  return { type: "interpolation", expression: expr };
}

function classifyTemplateLiteral(expr: t.TemplateLiteral): ClassificationResult {
  // Template literals like `${size}px` - these need special handling
  return { type: "interpolation", expression: expr };
}

function classifyMemberExpression(
  expr: t.MemberExpression,
): ClassificationResult {
  const path = extractMemberPath(expr);

  // Could be theme.x.y or constants.x
  if (path.length > 0) {
    return { type: "interpolation", expression: expr };
  }

  return { type: "interpolation", expression: expr };
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Extract the access path from a member expression
 * @example props.theme.colors.primary → ['props', 'theme', 'colors', 'primary']
 */
export function extractMemberPath(expr: t.MemberExpression): string[] {
  const path: string[] = [];

  let current: t.Expression = expr;
  while (isMemberExpression(current)) {
    if (isIdentifier(current.property)) {
      path.unshift(current.property.name);
    } else if (isStringLiteral(current.property)) {
      path.unshift(current.property.value);
    } else {
      // Computed property with non-static value
      break;
    }
    current = current.object;
  }

  if (isIdentifier(current)) {
    path.unshift(current.name);
  }

  return path;
}

/**
 * Extract prop name from a condition expression
 */
function extractPropNameFromCondition(expr: t.Expression): string | null {
  // props.$primary
  if (isMemberExpression(expr)) {
    const path = extractMemberPath(expr);
    if (path[0] === "props" && path.length === 2) {
      return path[1]!;
    }
  }

  // !!props.$primary
  if (isUnaryExpression(expr) && expr.operator === "!") {
    return extractPropNameFromCondition(expr.argument as t.Expression);
  }

  return null;
}

/**
 * Extract a static value from an expression
 */
export function extractStaticValue(
  expr: t.Expression,
): string | number | boolean | null {
  if (isStringLiteral(expr)) {
    return expr.value;
  }
  if (isNumericLiteral(expr)) {
    return expr.value;
  }
  if (isBooleanLiteral(expr)) {
    return expr.value;
  }
  if (isTemplateLiteral(expr) && expr.expressions.length === 0) {
    return expr.quasis[0]?.value.cooked ?? null;
  }
  return null;
}

/**
 * Extract the value from a literal expression
 */
function extractLiteralValue(expr: t.Expression): string | number {
  if (isStringLiteral(expr)) {
    return expr.value;
  }
  if (isNumericLiteral(expr)) {
    return expr.value;
  }
  if (isTemplateLiteral(expr) && expr.expressions.length === 0) {
    return expr.quasis[0]?.value.cooked ?? "";
  }
  return "";
}

/**
 * Wrap an expression in an arrow function if needed
 */
function wrapInArrowIfNeeded(
  expr: t.Expression,
  _param: t.Node | undefined,
): t.Expression {
  // If we already have the param from the outer arrow function,
  // we're already inside an arrow function body
  return expr;
}

// ============================================================================
// Type Guards (lightweight versions without importing @babel/types)
// ============================================================================

function isArrowFunctionExpression(
  node: t.Expression,
): node is t.ArrowFunctionExpression {
  return node.type === "ArrowFunctionExpression";
}

function isCallExpression(node: t.Expression): node is t.CallExpression {
  return node.type === "CallExpression";
}

function isIdentifier(node: t.Node): node is t.Identifier {
  return node.type === "Identifier";
}

function isConditionalExpression(
  node: t.Expression,
): node is t.ConditionalExpression {
  return node.type === "ConditionalExpression";
}

function isLogicalExpression(node: t.Expression): node is t.LogicalExpression {
  return node.type === "LogicalExpression";
}

function isTemplateLiteral(node: t.Expression): node is t.TemplateLiteral {
  return node.type === "TemplateLiteral";
}

function isMemberExpression(node: t.Expression): node is t.MemberExpression {
  return node.type === "MemberExpression";
}

function isLiteral(node: t.Expression): boolean {
  return (
    node.type === "StringLiteral" ||
    node.type === "NumericLiteral" ||
    node.type === "BooleanLiteral" ||
    node.type === "NullLiteral" ||
    (node.type === "TemplateLiteral" &&
      (node as t.TemplateLiteral).expressions.length === 0)
  );
}

function isBinaryExpression(node: t.Expression): node is t.BinaryExpression {
  return node.type === "BinaryExpression";
}

function isStringLiteral(node: t.Node): node is t.StringLiteral {
  return node.type === "StringLiteral";
}

function isNumericLiteral(node: t.Node): node is t.NumericLiteral {
  return node.type === "NumericLiteral";
}

function isBooleanLiteral(node: t.Node): node is t.BooleanLiteral {
  return node.type === "BooleanLiteral";
}

function isUnaryExpression(node: t.Expression): node is t.UnaryExpression {
  return node.type === "UnaryExpression";
}

function isSpreadElement(node: t.Node): node is t.SpreadElement {
  return node.type === "SpreadElement";
}

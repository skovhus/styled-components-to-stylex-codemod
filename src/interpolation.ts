/**
 * Interpolation Classification
 *
 * Analyzes template literal expressions to classify their type
 * and extract semantic information for handlers.
 */

import type {
  Expression,
  ArrowFunctionExpression,
  FunctionExpression,
  MemberExpression,
  ConditionalExpression,
  CallExpression,
  Identifier,
  LogicalExpression,
  BinaryExpression,
  UnaryExpression,
  TaggedTemplateExpression,
} from "jscodeshift";
import type { InterpolationLocation } from "./css-parser.js";

/**
 * Classification of interpolation expressions
 */
export type InterpolationType =
  | "static" // ${variable} - constant/variable reference
  | "prop-access" // ${props => props.x} or ${p => p.theme.y}
  | "conditional" // ${props => props.x ? a : b}
  | "helper" // ${helperFn()} or ${css`...`}
  | "keyframes" // ${keyframesRef}
  | "component" // ${OtherComponent} - component selector
  | "logical" // ${props => props.x && 'value'}
  | "unknown"; // complex expressions

/**
 * Extracted conditional branch information
 */
export interface ConditionalBranches {
  /** The condition expression as source code */
  condition: string;
  /** The prop name being checked (if identifiable) */
  propName?: string;
  /** The comparison value (e.g., "large" from props.size === "large") */
  comparisonValue?: string;
  /** The truthy branch value */
  truthy: string;
  /** The falsy branch value */
  falsy: string;
}

/**
 * Extracted logical expression information
 */
export interface LogicalInfo {
  /** The condition expression as source code */
  condition: string;
  /** The prop name being checked (if identifiable) */
  propName?: string;
  /** The value if condition is truthy */
  value: string;
  /** The logical operator (&& or ||) */
  operator: "&&" | "||";
}

/**
 * Classified interpolation with semantic information
 */
export interface ClassifiedInterpolation {
  /** The interpolation type */
  type: InterpolationType;
  /** Original interpolation location */
  location: InterpolationLocation;
  /** Extracted prop path for prop-access types */
  propPath?: string[];
  /** Whether this accesses theme */
  isThemeAccess?: boolean;
  /** Conditional branch info for conditional types */
  conditionalBranches?: ConditionalBranches;
  /** Logical expression info */
  logicalInfo?: LogicalInfo;
  /** For helpers, the function name */
  helperName?: string;
  /**
   * For prop-accessor helper calls like:
   *   ${(props) => getColor(props.$variant)}
   *
   * This captures the first argument when it is a member-expression path.
   */
  helperCallArgPropPath?: string[];
  /** For keyframes, the keyframes identifier name */
  keyframesName?: string;
  /** The expression as source code */
  sourceCode: string;
}

/**
 * Context needed for classification
 */
export interface ClassificationContext {
  /** Map of known keyframes identifiers */
  keyframesIdentifiers: Set<string>;
  /** Map of known styled component identifiers */
  styledComponentIdentifiers: Set<string>;
  /** Map of known css`` tagged templates */
  cssHelperIdentifiers: Set<string>;
  /** Function to get source code from an AST node */
  getSource: (node: Expression) => string;
}

/**
 * Classify an interpolation expression
 */
export function classifyInterpolation(
  location: InterpolationLocation,
  ctx: ClassificationContext,
): ClassifiedInterpolation {
  const expr = location.expression;
  const sourceCode = ctx.getSource(expr);

  // Check for arrow function or function expression (prop accessors)
  if (expr.type === "ArrowFunctionExpression" || expr.type === "FunctionExpression") {
    return classifyPropAccessor(
      expr as ArrowFunctionExpression | FunctionExpression,
      location,
      sourceCode,
      ctx,
    );
  }

  // Check for identifier (could be keyframes, component, or static variable)
  if (expr.type === "Identifier") {
    return classifyIdentifier(expr as Identifier, location, sourceCode, ctx);
  }

  // Check for call expression (helper functions)
  if (expr.type === "CallExpression") {
    return classifyCallExpression(expr as CallExpression, location, sourceCode, ctx);
  }

  // Check for tagged template literal (css`...`)
  if (expr.type === "TaggedTemplateExpression") {
    const taggedExpr = expr as TaggedTemplateExpression;
    const helperName =
      taggedExpr.tag.type === "Identifier" ? (taggedExpr.tag as Identifier).name : undefined;
    const result: ClassifiedInterpolation = {
      type: "helper",
      location,
      sourceCode,
    };
    if (helperName !== undefined) {
      result.helperName = helperName;
    }
    return result;
  }

  // Check for member expression (object.property access)
  if (expr.type === "MemberExpression") {
    const path = extractMemberPath(expr as MemberExpression);
    if (path) {
      return {
        type: "static",
        location,
        sourceCode,
        propPath: path,
      };
    }
  }

  // Check for template literal (string interpolation)
  if (expr.type === "TemplateLiteral") {
    return {
      type: "static",
      location,
      sourceCode,
    };
  }

  // Check for binary expressions (e.g., `${spacing / 2}px`)
  if (expr.type === "BinaryExpression") {
    return {
      type: "static",
      location,
      sourceCode,
    };
  }

  // Check for conditional expression at top level
  if (expr.type === "ConditionalExpression") {
    const branches = extractConditionalBranches(expr as ConditionalExpression, ctx);
    return {
      type: "conditional",
      location,
      sourceCode,
      conditionalBranches: branches,
    };
  }

  // Check for logical expression at top level
  if (expr.type === "LogicalExpression") {
    const info = extractLogicalInfo(expr as LogicalExpression, ctx);
    return {
      type: "logical",
      location,
      sourceCode,
      logicalInfo: info,
    };
  }

  // Unknown expression type
  return {
    type: "unknown",
    location,
    sourceCode,
  };
}

/**
 * Classify a prop accessor function (arrow function or regular function)
 */
function classifyPropAccessor(
  expr: ArrowFunctionExpression | FunctionExpression,
  location: InterpolationLocation,
  sourceCode: string,
  ctx: ClassificationContext,
): ClassifiedInterpolation {
  const body = expr.body;

  // For arrow functions with expression body
  if (expr.type === "ArrowFunctionExpression" && body.type !== "BlockStatement") {
    // Check for conditional expression: props => props.x ? a : b
    if (body.type === "ConditionalExpression") {
      const branches = extractConditionalBranches(body, ctx);
      return {
        type: "conditional",
        location,
        sourceCode,
        conditionalBranches: branches,
      };
    }

    // Check for logical expression: props => props.x && 'value'
    if (body.type === "LogicalExpression") {
      const info = extractLogicalInfo(body, ctx);
      return {
        type: "logical",
        location,
        sourceCode,
        logicalInfo: info,
      };
    }

    // Check for member expression: props => props.theme.x
    if (body.type === "MemberExpression") {
      const path = extractMemberPath(body);
      if (path) {
        const isTheme = path.includes("theme");
        return {
          type: "prop-access",
          location,
          sourceCode,
          propPath: path,
          isThemeAccess: isTheme,
        };
      }
    }

    // Check for call expression inside arrow: props => getColor(props.variant)
    if (body.type === "CallExpression") {
      const helperName = getCallExpressionName(body);
      // Try to extract the first argument as a prop path, e.g. props.$variant
      const firstArg = body.arguments[0];
      const helperCallArgPropPath =
        firstArg && firstArg.type === "MemberExpression"
          ? extractMemberPath(firstArg as MemberExpression)
          : undefined;
      const result: ClassifiedInterpolation = {
        type: "helper",
        location,
        sourceCode,
      };
      if (helperName !== undefined) {
        result.helperName = helperName;
      }
      if (helperCallArgPropPath) {
        result.helperCallArgPropPath = helperCallArgPropPath;
      }
      return result;
    }
  }

  // Default to prop-access for function expressions
  return {
    type: "prop-access",
    location,
    sourceCode,
  };
}

/**
 * Classify an identifier expression
 */
function classifyIdentifier(
  expr: Identifier,
  location: InterpolationLocation,
  sourceCode: string,
  ctx: ClassificationContext,
): ClassifiedInterpolation {
  const name = expr.name;

  // Check if it's a known keyframes identifier
  if (ctx.keyframesIdentifiers.has(name)) {
    return {
      type: "keyframes",
      location,
      sourceCode,
      keyframesName: name,
    };
  }

  // Check if it's a known styled component (component selector)
  if (ctx.styledComponentIdentifiers.has(name)) {
    return {
      type: "component",
      location,
      sourceCode,
    };
  }

  // Check if it's a css helper
  if (ctx.cssHelperIdentifiers.has(name)) {
    return {
      type: "helper",
      location,
      sourceCode,
      helperName: name,
    };
  }

  // Default to static variable reference
  return {
    type: "static",
    location,
    sourceCode,
  };
}

/**
 * Classify a call expression
 */
function classifyCallExpression(
  expr: CallExpression,
  location: InterpolationLocation,
  sourceCode: string,
  _ctx: ClassificationContext,
): ClassifiedInterpolation {
  const helperName = getCallExpressionName(expr);

  const result: ClassifiedInterpolation = {
    type: "helper",
    location,
    sourceCode,
  };

  if (helperName !== undefined) {
    result.helperName = helperName;
  }

  return result;
}

/**
 * Extract the member expression path as an array of strings
 */
function extractMemberPath(expr: MemberExpression): string[] | null {
  const path: string[] = [];
  let current: Expression = expr;

  while (current.type === "MemberExpression") {
    const memberExpr = current as MemberExpression;

    if (memberExpr.property.type === "Identifier") {
      path.unshift((memberExpr.property as Identifier).name);
    } else {
      return null; // Can't handle computed properties
    }

    current = memberExpr.object as Expression;
  }

  if (current.type === "Identifier") {
    path.unshift((current as Identifier).name);
    return path;
  }

  return null;
}

/**
 * Extract conditional branches from a ternary expression
 */
function extractConditionalBranches(
  expr: ConditionalExpression,
  ctx: ClassificationContext,
): ConditionalBranches {
  const condition = ctx.getSource(expr.test as Expression);
  const truthy = ctx.getSource(expr.consequent as Expression);
  const falsy = ctx.getSource(expr.alternate as Expression);

  // Try to extract prop name from condition
  const propName = extractPropNameFromCondition(expr.test as Expression);

  // Try to extract comparison value from condition (e.g., "large" from props.size === "large")
  const comparisonValue = extractComparisonValue(expr.test as Expression);

  const result: ConditionalBranches = {
    condition,
    truthy,
    falsy,
  };

  if (propName !== undefined) {
    result.propName = propName;
  }

  if (comparisonValue !== undefined) {
    result.comparisonValue = comparisonValue;
  }

  return result;
}

/**
 * Extract comparison value from a binary expression (e.g., "large" from props.size === "large")
 */
function extractComparisonValue(expr: Expression): string | undefined {
  if (expr.type === "BinaryExpression") {
    const binExpr = expr as BinaryExpression;
    if (binExpr.operator === "===" || binExpr.operator === "==") {
      // Check right side for string literal
      if (binExpr.right.type === "StringLiteral") {
        return (binExpr.right as import("jscodeshift").StringLiteral).value;
      }
      // Check left side for string literal (props.size === "large" or "large" === props.size)
      if (binExpr.left.type === "StringLiteral") {
        return (binExpr.left as import("jscodeshift").StringLiteral).value;
      }
    }
  }
  return undefined;
}

/**
 * Extract logical expression info
 */
function extractLogicalInfo(expr: LogicalExpression, ctx: ClassificationContext): LogicalInfo {
  const condition = ctx.getSource(expr.left as Expression);
  const value = ctx.getSource(expr.right as Expression);
  const operator = expr.operator as "&&" | "||";

  // Try to extract prop name from condition
  const propName = extractPropNameFromCondition(expr.left as Expression);

  const result: LogicalInfo = {
    condition,
    value,
    operator,
  };

  if (propName !== undefined) {
    result.propName = propName;
  }

  return result;
}

/**
 * Try to extract prop name from a condition expression
 */
function extractPropNameFromCondition(expr: Expression): string | undefined {
  // Handle: props.x, props.$x, p.x
  if (expr.type === "MemberExpression") {
    const memberExpr = expr as MemberExpression;
    if (memberExpr.property.type === "Identifier") {
      return (memberExpr.property as Identifier).name;
    }
  }

  // Handle: props.x === value
  if (expr.type === "BinaryExpression") {
    const binExpr = expr as BinaryExpression;
    if (binExpr.left.type === "MemberExpression") {
      return extractPropNameFromCondition(binExpr.left as Expression);
    }
  }

  // Handle: !props.x
  if (expr.type === "UnaryExpression") {
    const unaryExpr = expr as UnaryExpression;
    return extractPropNameFromCondition(unaryExpr.argument as Expression);
  }

  return undefined;
}

/**
 * Get the function name from a call expression
 */
function getCallExpressionName(expr: CallExpression): string | undefined {
  if (expr.callee.type === "Identifier") {
    return (expr.callee as Identifier).name;
  }
  if (expr.callee.type === "MemberExpression") {
    const memberExpr = expr.callee as MemberExpression;
    if (memberExpr.property.type === "Identifier") {
      return (memberExpr.property as Identifier).name;
    }
  }
  return undefined;
}

/**
 * Analyze a file to find known identifiers for classification
 */
export function createClassificationContext(
  keyframes: Set<string>,
  styledComponents: Set<string>,
  cssHelpers: Set<string>,
  getSource: (node: Expression) => string,
): ClassificationContext {
  return {
    keyframesIdentifiers: keyframes,
    styledComponentIdentifiers: styledComponents,
    cssHelperIdentifiers: cssHelpers,
    getSource,
  };
}

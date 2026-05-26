/**
 * Conservative static evaluation helpers for observed JSX prop values.
 */
import type { JSCodeshift } from "jscodeshift";
import type { ComponentPropUsageInfo } from "../transform-types.js";
import { extractRootAndPath } from "../utilities/jscodeshift-utils.js";

type StaticEvalValue = string | number | boolean | null | undefined;

type StaticEvalResult = { supported: true; value: StaticEvalValue } | { supported: false };
type StaticReturnResult =
  | { supported: true; returned: true; value: StaticEvalValue }
  | { supported: true; returned: false }
  | { supported: false };
type LocalSingleParamFunction = { paramName: string; body: unknown };
type StaticEvalContext = {
  j: JSCodeshift;
  root: ReturnType<JSCodeshift>;
  paramName?: string | null;
  callStack: ReadonlySet<string>;
};

const MAX_STATIC_CALL_DEPTH = 20;

export function getObservedStaticVariantValues(
  propUsageByComponent: Map<string, ComponentPropUsageInfo>,
  componentName: string,
  jsxProp: string,
): Array<string | number> | null {
  const usage = propUsageByComponent.get(componentName);
  if (!usage || usage.hasUnknownUsage) {
    return null;
  }
  const propUsage = usage.props[jsxProp];
  if (!propUsage || propUsage.hasUnknown || propUsage.values.length < 2) {
    return null;
  }
  const values = propUsage.values.filter(
    (value: string | number | boolean): value is string | number =>
      typeof value === "string" || typeof value === "number",
  );
  return values.length === propUsage.values.length ? values : null;
}

export function evaluateLocalCallValueTransform(args: {
  j: JSCodeshift;
  root: ReturnType<JSCodeshift>;
  calleeName: string;
  argValue: StaticEvalValue;
  callStack?: ReadonlySet<string>;
}): StaticEvalValue | null {
  const callStack = args.callStack ?? new Set<string>();
  if (callStack.has(args.calleeName) || callStack.size >= MAX_STATIC_CALL_DEPTH) {
    return null;
  }
  const fn = findLocalSingleParamFunction(args);
  if (!fn) {
    return null;
  }
  const nextCallStack = new Set(callStack);
  nextCallStack.add(args.calleeName);
  const result = evaluateFunctionBody(fn.body, fn.paramName, args.argValue, {
    j: args.j,
    root: args.root,
    callStack: nextCallStack,
  });
  return result.supported && result.returned ? result.value : null;
}

export function evaluateObservedDynamicExpression(args: {
  j: JSCodeshift;
  root: ReturnType<JSCodeshift>;
  expression: unknown;
  propName: string;
  propValue: string | number;
  paramName?: string | null;
}): StaticEvalValue | null {
  const result = evaluateStaticExpression(args.expression, args.propName, args.propValue, {
    j: args.j,
    root: args.root,
    paramName: args.paramName ?? null,
    callStack: new Set<string>(),
  });
  return result.supported ? result.value : null;
}

function findLocalSingleParamFunction(args: {
  j: JSCodeshift;
  root: ReturnType<JSCodeshift>;
  calleeName: string;
}): LocalSingleParamFunction | null {
  const { j, root, calleeName } = args;
  const candidates: LocalSingleParamFunction[] = [];
  let matchingBindings = 0;

  root.find(j.FunctionDeclaration, { id: { name: calleeName } }).forEach((path) => {
    matchingBindings += 1;
    const fnNode = path.node;
    const paramName = getSingleIdentifierParamName(fnNode.params);
    if (paramName) {
      candidates.push({ paramName, body: fnNode.body });
    }
  });

  root.find(j.VariableDeclarator, { id: { name: calleeName } }).forEach((path) => {
    matchingBindings += 1;
    const init = path.node.init as
      | { type?: string; params?: unknown[]; body?: unknown }
      | null
      | undefined;
    if (!init || (init.type !== "ArrowFunctionExpression" && init.type !== "FunctionExpression")) {
      return;
    }
    const paramName = getSingleIdentifierParamName(init.params);
    if (paramName) {
      candidates.push({ paramName, body: init.body });
    }
  });

  const [candidate] = candidates;
  return matchingBindings === 1 && candidate ? candidate : null;
}

function getSingleIdentifierParamName(params: unknown[] | undefined): string | null {
  if (!params || params.length !== 1) {
    return null;
  }
  const param = params[0] as { type?: string; name?: string };
  return param.type === "Identifier" && param.name ? param.name : null;
}

function evaluateFunctionBody(
  body: unknown,
  propName: string,
  propValue: StaticEvalValue,
  ctx: StaticEvalContext,
): StaticReturnResult {
  const bodyNode = body as { type?: string; body?: unknown[] } | null | undefined;
  if (!bodyNode) {
    return { supported: false };
  }
  if (bodyNode.type !== "BlockStatement") {
    const result = evaluateStaticExpression(bodyNode, propName, propValue, ctx);
    return result.supported
      ? { supported: true, returned: true, value: result.value }
      : { supported: false };
  }
  const statements = bodyNode.body;
  if (!Array.isArray(statements)) {
    return { supported: false };
  }
  for (const statement of statements) {
    const result = evaluateStaticStatement(statement, propName, propValue, ctx);
    if (!result.supported || result.returned) {
      return result;
    }
  }
  return { supported: true, returned: false };
}

function evaluateStaticStatement(
  statement: unknown,
  propName: string,
  propValue: StaticEvalValue,
  ctx: StaticEvalContext,
): StaticReturnResult {
  const node = statement as
    | {
        type?: string;
        argument?: unknown;
        test?: unknown;
        consequent?: unknown;
        alternate?: unknown;
      }
    | null
    | undefined;
  if (!node) {
    return { supported: false };
  }
  if (node.type === "ReturnStatement") {
    if (node.argument === null || node.argument === undefined) {
      return { supported: true, returned: true, value: undefined };
    }
    const result = evaluateStaticExpression(node.argument, propName, propValue, ctx);
    return result.supported
      ? { supported: true, returned: true, value: result.value }
      : { supported: false };
  }
  if (node.type === "IfStatement") {
    const test = evaluateStaticExpression(node.test, propName, propValue, ctx);
    if (!test.supported || typeof test.value !== "boolean") {
      return { supported: false };
    }
    if (test.value) {
      return evaluateStaticBranch(node.consequent, propName, propValue, ctx);
    }
    return node.alternate
      ? evaluateStaticBranch(node.alternate, propName, propValue, ctx)
      : { supported: true, returned: false };
  }
  return { supported: false };
}

function evaluateStaticBranch(
  branch: unknown,
  propName: string,
  propValue: StaticEvalValue,
  ctx: StaticEvalContext,
): StaticReturnResult {
  const node = branch as { type?: string } | null | undefined;
  if (node?.type === "BlockStatement") {
    return evaluateFunctionBody(node, propName, propValue, ctx);
  }
  return evaluateStaticStatement(branch, propName, propValue, ctx);
}

function evaluateStaticExpression(
  expression: unknown,
  propName: string,
  propValue: StaticEvalValue,
  ctx: StaticEvalContext,
): StaticEvalResult {
  const node = expression as
    | {
        type?: string;
        name?: string;
        value?: unknown;
        operator?: string;
        argument?: unknown;
        left?: unknown;
        right?: unknown;
        expression?: unknown;
        test?: unknown;
        consequent?: unknown;
        alternate?: unknown;
        callee?: unknown;
        arguments?: unknown[];
        quasis?: Array<{ value?: { cooked?: string | null; raw?: string } }>;
        expressions?: unknown[];
      }
    | null
    | undefined;
  if (!node) {
    return { supported: false };
  }

  if (node.type === "Identifier") {
    return node.name === propName ? { supported: true, value: propValue } : { supported: false };
  }
  if (node.type === "MemberExpression" || node.type === "OptionalMemberExpression") {
    const info = extractRootAndPath(node);
    if (info && ctx.paramName && info.rootName === ctx.paramName && info.path[0] === propName) {
      return info.path.length === 1 ? { supported: true, value: propValue } : { supported: false };
    }
    return { supported: false };
  }
  if (node.type === "CallExpression") {
    const callee = node.callee as { type?: string; name?: string } | null | undefined;
    if (callee?.type !== "Identifier" || !callee.name || (node.arguments?.length ?? 0) !== 1) {
      return { supported: false };
    }
    const callArg = evaluateStaticExpression(node.arguments?.[0], propName, propValue, ctx);
    if (!callArg.supported) {
      return { supported: false };
    }
    const value = evaluateLocalCallValueTransform({
      j: ctx.j,
      root: ctx.root,
      calleeName: callee.name,
      argValue: callArg.value,
      callStack: ctx.callStack,
    });
    return isStaticEvalValue(value) ? { supported: true, value } : { supported: false };
  }
  if (node.type === "Literal") {
    return isStaticEvalValue(node.value)
      ? { supported: true, value: node.value }
      : { supported: false };
  }
  if (
    node.type === "StringLiteral" ||
    node.type === "NumericLiteral" ||
    node.type === "BooleanLiteral"
  ) {
    return isStaticEvalValue(node.value)
      ? { supported: true, value: node.value }
      : { supported: false };
  }
  if (node.type === "NullLiteral") {
    return { supported: true, value: null };
  }
  if (
    node.type === "ParenthesizedExpression" ||
    node.type === "TSAsExpression" ||
    node.type === "TSTypeAssertion"
  ) {
    return evaluateStaticExpression(node.expression, propName, propValue, ctx);
  }
  if (node.type === "UnaryExpression") {
    const argument = evaluateStaticExpression(node.argument, propName, propValue, ctx);
    if (!argument.supported) {
      return { supported: false };
    }
    if (node.operator === "!") {
      return { supported: true, value: !argument.value };
    }
    if (node.operator === "typeof") {
      return { supported: true, value: typeof argument.value };
    }
    return { supported: false };
  }
  if (node.type === "LogicalExpression") {
    const left = evaluateStaticExpression(node.left, propName, propValue, ctx);
    if (!left.supported) {
      return { supported: false };
    }
    if (node.operator === "||") {
      return left.value ? left : evaluateStaticExpression(node.right, propName, propValue, ctx);
    }
    if (node.operator === "&&") {
      return left.value ? evaluateStaticExpression(node.right, propName, propValue, ctx) : left;
    }
    if (node.operator === "??") {
      return left.value === null || left.value === undefined
        ? evaluateStaticExpression(node.right, propName, propValue, ctx)
        : left;
    }
    return { supported: false };
  }
  if (node.type === "BinaryExpression") {
    return evaluateStaticBinaryExpression(node, propName, propValue, ctx);
  }
  if (node.type === "ConditionalExpression") {
    const test = evaluateStaticExpression(node.test, propName, propValue, ctx);
    if (!test.supported || typeof test.value !== "boolean") {
      return { supported: false };
    }
    return evaluateStaticExpression(
      test.value ? node.consequent : node.alternate,
      propName,
      propValue,
      ctx,
    );
  }
  if (node.type === "TemplateLiteral" && node.quasis && node.expressions) {
    return evaluateStaticTemplateLiteral(
      { quasis: node.quasis, expressions: node.expressions },
      propName,
      propValue,
      ctx,
    );
  }
  return { supported: false };
}

function evaluateStaticBinaryExpression(
  node: { operator?: string; left?: unknown; right?: unknown },
  propName: string,
  propValue: StaticEvalValue,
  ctx: StaticEvalContext,
): StaticEvalResult {
  const left = evaluateStaticExpression(node.left, propName, propValue, ctx);
  const right = evaluateStaticExpression(node.right, propName, propValue, ctx);
  if (!left.supported || !right.supported) {
    return { supported: false };
  }
  switch (node.operator) {
    case "===":
      return { supported: true, value: left.value === right.value };
    case "!==":
      return { supported: true, value: left.value !== right.value };
    case "+":
      return typeof left.value === "number" && typeof right.value === "number"
        ? { supported: true, value: left.value + right.value }
        : { supported: true, value: `${String(left.value)}${String(right.value)}` };
    default:
      return { supported: false };
  }
}

function evaluateStaticTemplateLiteral(
  node: {
    quasis: Array<{ value?: { cooked?: string | null; raw?: string } }>;
    expressions: unknown[];
  },
  propName: string,
  propValue: StaticEvalValue,
  ctx: StaticEvalContext,
): StaticEvalResult {
  let value = "";
  for (let i = 0; i < node.quasis.length; i++) {
    value += node.quasis[i]?.value?.cooked ?? node.quasis[i]?.value?.raw ?? "";
    if (i < node.expressions.length) {
      const expressionValue = evaluateStaticExpression(
        node.expressions[i],
        propName,
        propValue,
        ctx,
      );
      if (!expressionValue.supported) {
        return { supported: false };
      }
      value += String(expressionValue.value);
    }
  }
  return { supported: true, value };
}

function isStaticEvalValue(value: unknown): value is StaticEvalValue {
  return (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean" ||
    value === null ||
    value === undefined
  );
}

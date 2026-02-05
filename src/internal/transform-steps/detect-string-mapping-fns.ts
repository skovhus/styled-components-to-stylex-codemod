/**
 * Step: detect string-mapping helper functions for value resolution.
 * Core concepts: simple function pattern recognition.
 */
import { CONTINUE, type StepResult } from "../transform-types.js";
import { TransformContext } from "../transform-context.js";

/**
 * Detects simple string-mapping helper functions for later style resolution.
 */
export function detectStringMappingFnsStep(ctx: TransformContext): StepResult {
  const { root, j } = ctx;
  const stringMappingFns = new Map<
    string,
    {
      param: string;
      testParam: string;
      whenValue: string;
      thenValue: string;
      elseValue: string;
    }
  >();
  root.find(j.VariableDeclarator).forEach((p) => {
    if (p.node.id.type !== "Identifier") {
      return;
    }
    const name = p.node.id.name;
    const init: any = p.node.init;
    if (!init || init.type !== "ArrowFunctionExpression") {
      return;
    }
    const param0 = init.params?.[0];
    if (!param0 || param0.type !== "Identifier") {
      return;
    }
    const paramName = param0.name;
    const body = init.body;
    if (!body || body.type !== "ConditionalExpression") {
      return;
    }
    const test: any = body.test;
    const cons: any = body.consequent;
    const alt: any = body.alternate;
    if (
      test?.type === "BinaryExpression" &&
      test.operator === "===" &&
      test.left?.type === "Identifier" &&
      test.left.name === paramName &&
      (test.right?.type === "StringLiteral" || test.right?.type === "Literal") &&
      (cons?.type === "StringLiteral" || cons?.type === "Literal") &&
      (alt?.type === "StringLiteral" || alt?.type === "Literal")
    ) {
      const whenValue = String(test.right.value);
      const thenValue = String(cons.value);
      const elseValue = String(alt.value);
      stringMappingFns.set(name, {
        param: paramName,
        testParam: paramName,
        whenValue,
        thenValue,
        elseValue,
      });
    }
  });

  ctx.stringMappingFns = stringMappingFns;

  return CONTINUE;
}

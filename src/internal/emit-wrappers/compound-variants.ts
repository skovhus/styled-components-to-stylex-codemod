/**
 * Compound variant helpers shared by intrinsic and component wrapper emitters.
 * Core concepts: synthetic variant keys and nested ternary style arguments.
 */
import type { JSCodeshift } from "jscodeshift";
import type { StyledDecl } from "../transform-types.js";
import type { ExpressionKind } from "./types.js";

export function collectCompoundVariantKeys(
  compoundVariants: StyledDecl["compoundVariants"],
  opts?: { syntheticOnly?: boolean },
): Set<string> {
  const keys = new Set<string>();
  for (const cv of compoundVariants ?? []) {
    for (const k of getCompoundVariantWhenKeys(cv, opts?.syntheticOnly)) {
      keys.add(k);
    }
  }
  return keys;
}

export function appendCompoundVariantStyleArgs(args: {
  compoundVariants: NonNullable<StyledDecl["compoundVariants"]>;
  styleArgs: ExpressionKind[];
  destructureProps?: string[];
  j: JSCodeshift;
  stylesIdentifier: string;
}): void {
  const { compoundVariants, styleArgs, destructureProps, j, stylesIdentifier } = args;

  for (const cv of compoundVariants) {
    if (destructureProps) {
      if (!destructureProps.includes(cv.outerProp)) {
        destructureProps.push(cv.outerProp);
      }
      if (!destructureProps.includes(cv.innerProp)) {
        destructureProps.push(cv.innerProp);
      }
    }

    const outerPropId = j.identifier(cv.outerProp);
    const innerPropId = j.identifier(cv.innerProp);
    const stylesId = j.identifier(stylesIdentifier);

    if (cv.kind === "4branch") {
      const outerTrue = j.conditionalExpression(
        innerPropId,
        j.memberExpression(stylesId, j.identifier(cv.outerTruthyInnerTruthyKey)),
        j.memberExpression(stylesId, j.identifier(cv.outerTruthyInnerFalsyKey)),
      );
      const outerFalse = j.conditionalExpression(
        innerPropId,
        j.memberExpression(stylesId, j.identifier(cv.outerFalsyInnerTruthyKey)),
        j.memberExpression(stylesId, j.identifier(cv.outerFalsyInnerFalsyKey)),
      );
      styleArgs.push(j.conditionalExpression(outerPropId, outerTrue, outerFalse));
    } else {
      const outerStyle = j.memberExpression(stylesId, j.identifier(cv.outerTruthyKey));
      const innerTrueStyle = j.memberExpression(stylesId, j.identifier(cv.innerTruthyKey));
      const innerFalseStyle = j.memberExpression(stylesId, j.identifier(cv.innerFalsyKey));
      const innerTernary = j.conditionalExpression(innerPropId, innerTrueStyle, innerFalseStyle);
      styleArgs.push(j.conditionalExpression(outerPropId, outerStyle, innerTernary));
    }
  }
}

function getCompoundVariantWhenKeys(
  cv: NonNullable<StyledDecl["compoundVariants"]>[number],
  syntheticOnly?: boolean,
): string[] {
  if (cv.kind === "4branch") {
    return [
      `${cv.outerProp}_${cv.innerProp}`,
      `${cv.outerProp}_!${cv.innerProp}`,
      `!${cv.outerProp}_${cv.innerProp}`,
      `!${cv.outerProp}_!${cv.innerProp}`,
    ];
  }
  if (syntheticOnly) {
    return [cv.innerTruthyWhen, cv.innerFalsyWhen];
  }
  return [cv.outerProp, cv.innerTruthyWhen, cv.innerFalsyWhen];
}

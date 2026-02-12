/**
 * Builds relation override style objects from pseudo buckets.
 * Handles descendant, ancestor, and sibling selector overrides.
 */
import type { JSCodeshift } from "jscodeshift";
import { isAstNode } from "../utilities/jscodeshift-utils.js";
import type { ExpressionKind } from "./decl-types.js";
import { literalToAst } from "../transform/helpers.js";

export const finalizeRelationOverrides = (args: {
  j: JSCodeshift;
  relationOverridePseudoBuckets: Map<string, Map<string | null, Record<string, unknown>>>;
  resolvedStyleObjects: Map<string, unknown>;
  makeCssPropKey: (j: JSCodeshift, prop: string) => ExpressionKind;
}): void => {
  const { j, relationOverridePseudoBuckets, resolvedStyleObjects, makeCssPropKey } = args;
  if (relationOverridePseudoBuckets.size === 0) {
    return;
  }

  const makeAncestorKey = (pseudo: string) =>
    j.callExpression(
      j.memberExpression(
        j.memberExpression(j.identifier("stylex"), j.identifier("when")),
        j.identifier("ancestor"),
      ),
      [j.literal(pseudo)],
    );

  // Local type guard that narrows to ExpressionKind for use with jscodeshift builders
  const isExpressionNode = (v: unknown): v is ExpressionKind => isAstNode(v);

  for (const [overrideKey, pseudoBuckets] of relationOverridePseudoBuckets.entries()) {
    const baseBucket = pseudoBuckets.get(null) ?? {};
    const props: any[] = [];

    // Collect all property names across all pseudo buckets
    const allPropNames = new Set<string>();
    for (const bucket of pseudoBuckets.values()) {
      for (const prop of Object.keys(bucket)) {
        allPropNames.add(prop);
      }
    }

    for (const prop of allPropNames) {
      const baseVal = (baseBucket as Record<string, unknown>)[prop];
      // Collect pseudo values for this property
      const pseudoValues: Array<{ pseudo: string; value: unknown }> = [];
      for (const [pseudo, bucket] of pseudoBuckets.entries()) {
        if (pseudo === null) {
          continue;
        }
        const val = (bucket as Record<string, unknown>)[prop];
        if (val !== undefined) {
          pseudoValues.push({ pseudo, value: val });
        }
      }

      if (pseudoValues.length > 0) {
        // Build object expression with default and pseudo values
        const objProps: any[] = [
          j.property(
            "init",
            j.identifier("default"),
            isExpressionNode(baseVal) ? baseVal : literalToAst(j, baseVal ?? null),
          ),
        ];
        for (const { pseudo, value } of pseudoValues) {
          const ancestorKey = makeAncestorKey(pseudo);
          const valExpr = isExpressionNode(value) ? value : literalToAst(j, value);
          const propNode = Object.assign(j.property("init", ancestorKey, valExpr), {
            computed: true,
          });
          objProps.push(propNode);
        }
        const mapExpr = j.objectExpression(objProps);
        props.push(j.property("init", makeCssPropKey(j, prop), mapExpr));
      } else if (baseVal !== undefined) {
        props.push(
          j.property(
            "init",
            makeCssPropKey(j, prop),
            isExpressionNode(baseVal) ? baseVal : literalToAst(j, baseVal),
          ),
        );
      }
    }

    if (props.length > 0) {
      resolvedStyleObjects.set(overrideKey, j.objectExpression(props));
    }
  }
};

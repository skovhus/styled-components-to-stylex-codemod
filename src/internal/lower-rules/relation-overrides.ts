/**
 * Builds relation override style objects from condition buckets.
 */
import type { JSCodeshift } from "jscodeshift";
import { isAstNode } from "../utilities/jscodeshift-utils.js";
import type { ExpressionKind } from "./decl-types.js";
import { literalToAst } from "../transform/helpers.js";
import type { RelationBucketEntry, RelationOverride } from "./state.js";

export const finalizeRelationOverrides = (args: {
  j: JSCodeshift;
  relationOverrideBuckets: Map<string, Map<string, RelationBucketEntry>>;
  relationOverrideMarkersByKey: Map<string, string | null>;
  relationOverrides: RelationOverride[];
  resolvedStyleObjects: Map<string, unknown>;
  makeCssPropKey: (j: JSCodeshift, prop: string) => ExpressionKind;
}): void => {
  const {
    j,
    relationOverrideBuckets,
    relationOverrideMarkersByKey,
    relationOverrides,
    resolvedStyleObjects,
    makeCssPropKey,
  } = args;
  if (relationOverrideBuckets.size === 0) {
    return;
  }

  const relationByOverrideKey = new Map<string, RelationOverride>();
  for (const relationOverride of relationOverrides) {
    relationByOverrideKey.set(relationOverride.overrideStyleKey, relationOverride);
  }

  const makeAncestorKey = (pseudo: string, markerName: string | null) =>
    j.callExpression(
      j.memberExpression(
        j.memberExpression(j.identifier("stylex"), j.identifier("when")),
        j.identifier("ancestor"),
      ),
      markerName ? [j.literal(pseudo), j.identifier(markerName)] : [j.literal(pseudo)],
    );

  const toSiblingPseudoArg = (selectorArg: string | null): string => {
    const normalizedSelector = selectorArg?.trim() ?? "";
    if (normalizedSelector.length === 0) {
      return ":is(*)";
    }
    return normalizedSelector.startsWith(":") ? normalizedSelector : `:is(${normalizedSelector})`;
  };

  const makeSiblingBeforeKey = (selectorArg: string | null, markerName: string | null) => {
    const args: ExpressionKind[] = [j.literal(toSiblingPseudoArg(selectorArg))];
    if (markerName) {
      args.push(j.identifier(markerName));
    }
    return j.callExpression(
      j.memberExpression(
        j.memberExpression(j.identifier("stylex"), j.identifier("when")),
        j.identifier("siblingBefore"),
      ),
      args,
    );
  };

  const makeAnySiblingKey = (selectorArg: string | null, markerName: string | null) => {
    const args: ExpressionKind[] = [j.literal(toSiblingPseudoArg(selectorArg))];
    if (markerName) {
      args.push(j.identifier(markerName));
    }
    return j.callExpression(
      j.memberExpression(
        j.memberExpression(j.identifier("stylex"), j.identifier("when")),
        j.identifier("anySibling"),
      ),
      args,
    );
  };

  // Local type guard that narrows to ExpressionKind for use with jscodeshift builders
  const isExpressionNode = (value: unknown): value is ExpressionKind => isAstNode(value);

  for (const [overrideKey, bucketsByCondition] of relationOverrideBuckets.entries()) {
    const relationOverride = relationByOverrideKey.get(overrideKey);
    if (!relationOverride) {
      continue;
    }
    const markerName = relationOverrideMarkersByKey.get(overrideKey) ?? null;
    const props: any[] = [];
    const allPropNames = new Set<string>();
    const conditionalEntries: RelationBucketEntry[] = [];
    let baseProps: Record<string, unknown> = {};

    for (const entry of bucketsByCondition.values()) {
      for (const prop of Object.keys(entry.props)) {
        allPropNames.add(prop);
      }
      if (relationOverride.kind === "ancestor" && entry.condition.pseudo === null) {
        baseProps = { ...baseProps, ...entry.props };
        continue;
      }
      conditionalEntries.push(entry);
    }

    for (const prop of allPropNames) {
      const baseVal = baseProps[prop];
      const conditionalValues: Array<{
        entry: RelationBucketEntry;
        value: unknown;
      }> = [];
      for (const entry of conditionalEntries) {
        const value = entry.props[prop];
        if (value !== undefined) {
          conditionalValues.push({ entry, value });
        }
      }

      if (conditionalValues.length > 0) {
        const objProps: any[] = [
          j.property(
            "init",
            j.identifier("default"),
            isExpressionNode(baseVal) ? baseVal : literalToAst(j, baseVal ?? null),
          ),
        ];

        for (const { entry, value } of conditionalValues) {
          const keyExpr =
            entry.condition.kind === "ancestor"
              ? makeAncestorKey(entry.condition.pseudo ?? "", markerName)
              : entry.condition.kind === "adjacentSibling"
                ? makeSiblingBeforeKey(entry.condition.selectorArg, markerName)
                : makeAnySiblingKey(entry.condition.selectorArg, markerName);
          const valExpr = isExpressionNode(value) ? value : literalToAst(j, value);
          const propNode = Object.assign(j.property("init", keyExpr, valExpr), {
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

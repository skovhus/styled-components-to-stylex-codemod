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
  relationOverrides: RelationOverride[];
  resolvedStyleObjects: Map<string, unknown>;
  makeCssPropKey: (j: JSCodeshift, prop: string) => ExpressionKind;
}): void => {
  const { j, relationOverrideBuckets, relationOverrides, resolvedStyleObjects, makeCssPropKey } =
    args;
  if (relationOverrideBuckets.size === 0) {
    return;
  }

  const relationByOverrideKey = new Map<string, RelationOverride>();
  for (const relationOverride of relationOverrides) {
    relationByOverrideKey.set(relationOverride.overrideStyleKey, relationOverride);
  }

  const makeAncestorKey = (pseudo: string) =>
    j.callExpression(
      j.memberExpression(
        j.memberExpression(j.identifier("stylex"), j.identifier("when")),
        j.identifier("ancestor"),
      ),
      [j.literal(pseudo)],
    );

  const toSiblingPseudoArg = (selectorArg: string | null): string => {
    const normalizedSelector = selectorArg?.trim() ?? "";
    if (normalizedSelector.length === 0) {
      return ":is(*)";
    }
    return normalizedSelector.startsWith(":") ? normalizedSelector : `:is(${normalizedSelector})`;
  };

  const makeAdjacentSiblingKey = (selectorArg: string | null) => {
    const args: ExpressionKind[] = [j.literal(toSiblingPseudoArg(selectorArg))];
    return j.callExpression(
      j.memberExpression(
        j.memberExpression(j.identifier("stylex"), j.identifier("when")),
        j.identifier("siblingBefore"),
      ),
      args,
    );
  };
  const makeGeneralSiblingKey = (selectorArg: string | null) => {
    const args: ExpressionKind[] = [j.literal(toSiblingPseudoArg(selectorArg))];
    return j.callExpression(
      j.memberExpression(
        j.memberExpression(j.identifier("stylex"), j.identifier("when")),
        j.identifier("siblingBefore"),
      ),
      args,
    );
  };

  // Local type guard that narrows to ExpressionKind for use with jscodeshift builders
  const isExpressionNode = (value: unknown): value is ExpressionKind => isAstNode(value);
  const readDefaultFromNestedValue = (value: unknown): unknown => {
    if (!value || typeof value !== "object" || isExpressionNode(value)) {
      return undefined;
    }
    if (!Object.hasOwn(value as object, "default")) {
      return undefined;
    }
    return (value as Record<string, unknown>).default;
  };
  const readPropValueFromObjectExpression = (objectExpression: any, propName: string): unknown => {
    const props = objectExpression?.properties;
    if (!Array.isArray(props)) {
      return undefined;
    }
    for (const prop of props) {
      if (!prop || prop.type !== "Property" || prop.computed) {
        continue;
      }
      const key =
        prop.key?.type === "Identifier"
          ? prop.key.name
          : prop.key?.type === "Literal"
            ? prop.key.value
            : prop.key?.type === "StringLiteral"
              ? prop.key.value
              : null;
      if (key === propName) {
        return prop.value;
      }
    }
    return undefined;
  };
  const inferTargetDefaultValue = (
    relationOverride: RelationOverride,
    propName: string,
  ): unknown => {
    const targetStyleKey = relationOverride.targetStyleKey;
    if (!targetStyleKey) {
      return undefined;
    }
    const targetStyleObject = resolvedStyleObjects.get(targetStyleKey);
    if (!targetStyleObject) {
      return undefined;
    }

    if (!isExpressionNode(targetStyleObject) && typeof targetStyleObject === "object") {
      const plainValue = (targetStyleObject as Record<string, unknown>)[propName];
      const nestedDefault = readDefaultFromNestedValue(plainValue);
      return nestedDefault !== undefined ? nestedDefault : plainValue;
    }

    if (isExpressionNode(targetStyleObject) && targetStyleObject.type === "ObjectExpression") {
      const astPropValue = readPropValueFromObjectExpression(targetStyleObject, propName);
      if (!astPropValue) {
        return undefined;
      }
      if ((astPropValue as any).type === "ObjectExpression") {
        const astDefault = readPropValueFromObjectExpression(astPropValue, "default");
        return astDefault ?? astPropValue;
      }
      return astPropValue;
    }
    return undefined;
  };

  for (const [overrideKey, bucketsByCondition] of relationOverrideBuckets.entries()) {
    const relationOverride = relationByOverrideKey.get(overrideKey);
    if (!relationOverride) {
      continue;
    }
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
      const inferredTargetDefault =
        baseVal === undefined ? inferTargetDefaultValue(relationOverride, prop) : undefined;
      const defaultValue = baseVal !== undefined ? baseVal : inferredTargetDefault;
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
            isExpressionNode(defaultValue) ? defaultValue : literalToAst(j, defaultValue ?? null),
          ),
        ];

        for (const { entry, value } of conditionalValues) {
          const keyExpr =
            entry.condition.kind === "ancestor"
              ? makeAncestorKey(entry.condition.pseudo ?? "")
              : entry.condition.kind === "adjacentSibling"
                ? makeAdjacentSiblingKey(entry.condition.selectorArg)
                : makeGeneralSiblingKey(entry.condition.selectorArg);
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

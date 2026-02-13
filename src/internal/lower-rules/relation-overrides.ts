/**
 * Builds relation override style objects from pseudo buckets.
 * Handles descendant and ancestor selector overrides.
 */
import type { JSCodeshift } from "jscodeshift";
import { isAstNode } from "../utilities/jscodeshift-utils.js";
import type { ExpressionKind } from "./decl-types.js";
import { literalToAst } from "../transform/helpers.js";
import type { RelationOverride } from "./state.js";

export const finalizeRelationOverrides = (args: {
  j: JSCodeshift;
  relationOverridePseudoBuckets: Map<string, Map<string | null, Record<string, unknown>>>;
  relationOverrides: RelationOverride[];
  resolvedStyleObjects: Map<string, unknown>;
  makeCssPropKey: (j: JSCodeshift, prop: string) => ExpressionKind;
}): void => {
  const {
    j,
    relationOverridePseudoBuckets,
    relationOverrides,
    resolvedStyleObjects,
    makeCssPropKey,
  } = args;
  if (relationOverridePseudoBuckets.size === 0) {
    return;
  }

  // Build a lookup from override key → child style keys (primary + extras) for base value resolution
  const overrideToChildKeys = new Map<string, string[]>();
  for (const o of relationOverrides) {
    const keys = [o.childStyleKey, ...(o.childExtraStyleKeys ?? [])];
    overrideToChildKeys.set(o.overrideStyleKey, keys);
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

    // Look up the child's resolved style objects (primary + composed mixins)
    // for fallback base values. This handles:
    // 1. CSS ordering: reverse selector rule processed before base declaration
    // 2. Composed mixins: base value comes from a css helper, not the child's own style
    const childKeys = overrideToChildKeys.get(overrideKey) ?? [];
    const childStyleObjects: Array<Record<string, unknown>> = [];
    for (const key of childKeys) {
      const obj = resolvedStyleObjects.get(key);
      if (obj && typeof obj === "object" && !isAstNode(obj)) {
        childStyleObjects.push(obj as Record<string, unknown>);
      }
    }

    // Collect all property names across all pseudo buckets
    const allPropNames = new Set<string>();
    for (const bucket of pseudoBuckets.values()) {
      for (const prop of Object.keys(bucket)) {
        allPropNames.add(prop);
      }
    }

    for (const prop of allPropNames) {
      // Resolve base value: prefer explicit base bucket, then child's resolved styles
      // (including composed mixin style objects)
      let baseVal = baseBucket[prop];
      if (baseVal === undefined) {
        for (const childStyle of childStyleObjects) {
          const val = childStyle[prop];
          if (val !== undefined) {
            baseVal = val;
            break;
          }
        }
      }
      // When the base value is a pseudo/media map (e.g., { default: "gray", ":focus": "orange" }),
      // extract the scalar default to avoid JSON-stringifying the entire map.
      baseVal = extractScalarDefault(baseVal);

      // Collect pseudo values for this property
      const pseudoValues: Array<{ pseudo: string; value: unknown }> = [];
      for (const [pseudo, bucket] of pseudoBuckets.entries()) {
        if (pseudo === null) {
          continue;
        }
        const val = bucket[prop];
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

// --- Non-exported helpers ---

/**
 * If a value is a pseudo/media map (e.g., `{ default: "gray", ":focus": "orange" }`),
 * extracts its scalar `default` property. AST nodes and non-map values pass through.
 */
function extractScalarDefault(value: unknown): unknown {
  if (!value || typeof value !== "object" || Array.isArray(value) || isAstNode(value)) {
    return value;
  }
  const map = value as Record<string, unknown>;
  if ("default" in map) {
    return map.default;
  }
  return value;
}

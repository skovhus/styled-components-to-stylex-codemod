/**
 * Builds relation override style objects from pseudo buckets.
 * Handles descendant and ancestor selector overrides.
 */
import type { JSCodeshift } from "jscodeshift";
import { isAstNode } from "../utilities/jscodeshift-utils.js";
import type { ExpressionKind } from "./decl-types.js";
import { literalToAst } from "../transform/helpers.js";
import type { RelationOverride } from "./state.js";
import { makeAncestorKeyExpr } from "./shared.js";

export const finalizeRelationOverrides = (args: {
  j: JSCodeshift;
  relationOverridePseudoBuckets: Map<string, Map<string | null, Record<string, unknown>>>;
  relationOverrides: RelationOverride[];
  resolvedStyleObjects: Map<string, unknown>;
  makeCssPropKey: (j: JSCodeshift, prop: string) => ExpressionKind;
  childPseudoMarkers: Map<string, Set<string>>;
}): void => {
  const {
    j,
    relationOverridePseudoBuckets,
    relationOverrides,
    resolvedStyleObjects,
    makeCssPropKey,
    childPseudoMarkers,
  } = args;
  if (relationOverridePseudoBuckets.size === 0) {
    return;
  }

  // Build lookups from override key → child style keys and marker variable names (single pass)
  const overrideToChildKeys = new Map<string, string[]>();
  const overrideToMarker = new Map<string, string>();
  for (const o of relationOverrides) {
    overrideToChildKeys.set(o.overrideStyleKey, [
      o.childStyleKey,
      ...(o.childExtraStyleKeys ?? []),
    ]);
    if (o.markerVarName) {
      overrideToMarker.set(o.overrideStyleKey, o.markerVarName);
    }
  }

  for (const [overrideKey, pseudoBuckets] of relationOverridePseudoBuckets.entries()) {
    const props = buildRelationOverrideProperties({
      j,
      pseudoBuckets,
      childStyleObjects: buildChildStyleObjectList(
        overrideToChildKeys.get(overrideKey) ?? [],
        resolvedStyleObjects,
      ),
      makeCssPropKey,
      childPseudos: childPseudoMarkers.get(overrideKey),
      markerVarName: overrideToMarker.get(overrideKey),
    });
    if (props.length > 0) {
      resolvedStyleObjects.set(overrideKey, j.objectExpression(props));
    }
  }
};

export function buildRelationOverrideProperties(args: {
  j: JSCodeshift;
  pseudoBuckets: Map<string | null, Record<string, unknown>>;
  childStyleObjects?: Array<Record<string, unknown>>;
  makeCssPropKey: (j: JSCodeshift, prop: string) => ExpressionKind;
  childPseudos?: Set<string>;
  markerVarName?: string;
}): any[] {
  const {
    j,
    pseudoBuckets,
    childStyleObjects = [],
    makeCssPropKey,
    childPseudos,
    markerVarName,
  } = args;
  const props: any[] = [];

  const explicitBaseBucket = pseudoBuckets.get(null);
  const baseBucket = explicitBaseBucket ?? {};
  const isExpressionNode = (v: unknown): v is ExpressionKind => isAstNode(v);

  const allPropNames = new Set<string>();
  for (const bucket of pseudoBuckets.values()) {
    for (const prop of Object.keys(bucket)) {
      allPropNames.add(prop);
    }
  }

  for (const prop of allPropNames) {
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
    baseVal = extractScalarDefault(baseVal);

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
      const objProps: any[] = [
        j.property(
          "init",
          j.identifier("default"),
          isExpressionNode(baseVal) ? baseVal : literalToAst(j, baseVal ?? null),
        ),
      ];
      for (const { pseudo, value } of pseudoValues) {
        const valExpr = isExpressionNode(value) ? value : literalToAst(j, value);
        if (childPseudos?.has(pseudo)) {
          objProps.push(j.property("init", j.literal(pseudo), valExpr));
        } else {
          const ancestorKey = makeAncestorKeyExpr(j, pseudo, markerVarName);
          const propNode = Object.assign(j.property("init", ancestorKey, valExpr), {
            computed: true,
          });
          objProps.push(propNode);
        }
      }
      props.push(j.property("init", makeCssPropKey(j, prop), j.objectExpression(objProps)));
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

  return props;
}

// --- Non-exported helpers ---

/**
 * If a value is a pseudo/media map (e.g., `{ default: "gray", ":focus": "orange" }`),
 * extracts its scalar `default` property. AST nodes and non-map values pass through.
 */
function extractScalarDefault(value: unknown): unknown {
  if (!value || typeof value !== "object" || Array.isArray(value) || isAstNode(value)) {
    if (isAstNode(value) && (value as { type?: string }).type === "ObjectExpression") {
      const objectExpression = value as {
        properties?: Array<{
          type?: string;
          key?: { type?: string; name?: string; value?: unknown };
          value?: unknown;
        }>;
      };
      for (const property of objectExpression.properties ?? []) {
        if (property.type !== "Property") {
          continue;
        }
        const key =
          property.key?.type === "Identifier"
            ? property.key.name
            : property.key?.type === "Literal" || property.key?.type === "StringLiteral"
              ? String(property.key.value)
              : null;
        if (key === "default") {
          return property.value;
        }
      }
    }
    return value;
  }
  const map = value as Record<string, unknown>;
  if ("default" in map) {
    return map.default;
  }
  return value;
}

function buildChildStyleObjectList(
  childKeys: string[],
  resolvedStyleObjects: Map<string, unknown>,
): Array<Record<string, unknown>> {
  const childStyleObjects: Array<Record<string, unknown>> = [];
  for (const key of childKeys) {
    const obj = resolvedStyleObjects.get(key);
    if (obj && typeof obj === "object" && !isAstNode(obj)) {
      childStyleObjects.push(obj as Record<string, unknown>);
    }
  }
  return childStyleObjects;
}

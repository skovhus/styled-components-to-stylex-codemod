/**
 * Local element-override and adjacent-sibling analysis helpers extracted from
 * analyze-before-emit. Prove when a styled component's selector usages can be
 * safely lowered to local-element overrides, and build the resolved style
 * objects and override properties for them.
 */
import type { JSCodeshift } from "jscodeshift";
import type {
  LocalElementOverrideCandidate,
  LocalElementOverrideRelation,
  StyledDecl,
} from "../transform-types.js";
import { TransformContext } from "../transform-context.js";
import { getRootJsxIdentifierName, isAstNode } from "../utilities/jscodeshift-utils.js";
import { camelToKebabCase } from "../utilities/string-utils.js";
import { buildRelationOverrideProperties } from "../lower-rules/relation-overrides.js";
import { makeCssPropKey } from "../lower-rules/shared.js";
import { isPlainStyleObject } from "./promotable-style-props.js";

export function hasOnlyProvableAdjacentSiblingUsages(
  root: TransformContext["root"],
  j: JSCodeshift,
  componentName: string,
): boolean {
  let hasUsage = false;
  let isSafe = true;

  const inspectChildren = (children: unknown[]): void => {
    let previousWasTarget = false;

    for (const child of children) {
      if (!isSafe) {
        return;
      }
      const childState = classifyAdjacentSiblingChild(child, componentName);
      if (childState.kind === "dynamic") {
        isSafe = false;
        return;
      }
      if (childState.kind === "target") {
        hasUsage = true;
        if (!previousWasTarget) {
          previousWasTarget = true;
          continue;
        }
        previousWasTarget = true;
        continue;
      }
      if (childState.kind === "other") {
        previousWasTarget = false;
      }
    }
  };

  root.find(j.JSXElement).forEach((path: any) => {
    if (!isSafe) {
      return;
    }
    const children = path.node.children ?? [];
    if (
      !children.some(
        (child: unknown) => classifyAdjacentSiblingChild(child, componentName).kind === "target",
      )
    ) {
      return;
    }
    inspectChildren(children);
  });

  root.find(j.JSXFragment).forEach((path: any) => {
    if (!isSafe) {
      return;
    }
    const children = path.node.children ?? [];
    if (
      !children.some(
        (child: unknown) => classifyAdjacentSiblingChild(child, componentName).kind === "target",
      )
    ) {
      return;
    }
    inspectChildren(children);
  });

  return hasUsage && isSafe;
}

function classifyAdjacentSiblingChild(
  child: unknown,
  componentName: string,
): { kind: "target" | "other" | "dynamic" } {
  if (!child || typeof child !== "object") {
    return { kind: "other" };
  }

  const node = child as {
    type?: string;
    openingElement?: { name?: unknown };
    name?: unknown;
    expression?: { type?: string };
  };

  if (node.type === "JSXText") {
    return /\S/.test((node as { value?: string }).value ?? "")
      ? { kind: "other" }
      : { kind: "other" };
  }

  if (node.type === "JSXElement") {
    const name = getRootJsxIdentifierName(node.openingElement?.name);
    return name === componentName ? { kind: "target" } : { kind: "other" };
  }

  if (node.type === "JSXFragment") {
    return { kind: "dynamic" };
  }

  if (node.type === "JSXExpressionContainer") {
    const exprType = node.expression?.type;
    if (exprType === "Literal" || exprType === "StringLiteral" || exprType === "TemplateLiteral") {
      return { kind: "other" };
    }
    return { kind: "dynamic" };
  }

  return { kind: "other" };
}

export type LocalElementProofReason =
  | "ok"
  | "no-usage"
  | "dynamic-usage"
  | "non-jsx-usage"
  | "unknown-wrapper"
  | "unsupported-wrapper"
  | "child-not-inlineable";

export type LocalElementProofResult = {
  safe: boolean;
  reason: LocalElementProofReason;
  targetsByStyleKey: Map<string, Set<string>>;
  sawCandidateMatch: boolean;
};

export function proveLocalElementOverrideUsages(
  root: TransformContext["root"],
  j: JSCodeshift,
  componentName: string,
  overrides: LocalElementOverrideCandidate[],
  declByLocal: Map<string, StyledDecl>,
): LocalElementProofResult {
  const targetsByStyleKey = new Map<string, Set<string>>(
    overrides.map((override) => [override.styleKey, new Set<string>()]),
  );
  let sawUsage = false;
  let sawCandidateMatch = false;
  let reason: LocalElementProofReason = "ok";

  const inspectChildren = (
    children: unknown[],
    relation: LocalElementOverrideRelation,
    tagName: string,
  ): { safe: boolean; matches: Set<string>; reason?: LocalElementProofReason } => {
    const matches = new Set<string>();
    let failureReason: LocalElementProofReason | undefined;
    const visitChild = (child: unknown, isDirectChild: boolean): boolean => {
      if (!child || typeof child !== "object") {
        return true;
      }
      const node = child as {
        type?: string;
        children?: unknown[];
        openingElement?: { name?: unknown };
        expression?: {
          type?: string;
          expressions?: unknown[];
          elements?: unknown[];
          left?: unknown;
          right?: unknown;
          consequent?: unknown;
          alternate?: unknown;
        };
      };

      if (node.type === "JSXText") {
        return true;
      }
      if (node.type === "JSXFragment") {
        return false;
      }
      if (node.type === "JSXExpressionContainer") {
        const exprType = node.expression?.type;
        return (
          exprType === "JSXEmptyExpression" ||
          exprType === "Literal" ||
          exprType === "StringLiteral" ||
          exprType === "TemplateLiteral"
        );
      }
      if (node.type !== "JSXElement") {
        return false;
      }

      const name = getRootJsxIdentifierName(node.openingElement?.name);
      if (!name) {
        return false;
      }

      const decl = declByLocal.get(name);
      const isIntrinsicTagName = /^[a-z]/.test(name);
      const isIntrinsicMatch = isIntrinsicTagName && name === tagName;
      const staticAsTag =
        typeof decl?.attrsInfo?.staticAttrs?.as === "string"
          ? decl.attrsInfo.staticAttrs.as
          : undefined;
      const renderedTagName =
        decl?.attrsInfo?.attrsAsTag ??
        staticAsTag ??
        (decl?.base.kind === "intrinsic" ? decl.base.tagName : undefined);
      const isStyledIntrinsicMatch =
        !!decl && decl.base.kind === "intrinsic" && renderedTagName === tagName;
      const isUnknownWrapperBoundary =
        !isIntrinsicMatch && !isStyledIntrinsicMatch && (!!decl || !isIntrinsicTagName);

      if (
        (relation === "child" ? isDirectChild : true) &&
        (isIntrinsicMatch || isStyledIntrinsicMatch)
      ) {
        sawCandidateMatch = true;
        matches.add(isStyledIntrinsicMatch ? `styled:${name}` : `intrinsic:${tagName}`);
      }

      if (relation === "descendant") {
        if (isUnknownWrapperBoundary) {
          failureReason = "unsupported-wrapper";
          return false;
        }
        for (const grandchild of node.children ?? []) {
          if (!visitChild(grandchild, false)) {
            return false;
          }
        }
      }
      if (relation === "child" && isDirectChild && isUnknownWrapperBoundary) {
        failureReason = "unsupported-wrapper";
        return false;
      }
      return true;
    };

    for (const child of children) {
      if (!visitChild(child, true)) {
        return { safe: false, matches, ...(failureReason ? { reason: failureReason } : {}) };
      }
    }
    return { safe: true, matches };
  };

  root
    .find(j.JSXElement, {
      openingElement: { name: { type: "JSXIdentifier", name: componentName } },
    } as any)
    .forEach((path: any) => {
      sawUsage = true;
      for (const override of overrides) {
        const inspected = inspectChildren(
          path.node.children ?? [],
          override.relation,
          override.tagName,
        );
        if (!inspected.safe) {
          reason = inspected.reason ?? "dynamic-usage";
          return;
        }
        const targetSet = targetsByStyleKey.get(override.styleKey)!;
        for (const match of inspected.matches) {
          targetSet.add(match);
        }
      }
    });

  if (reason !== "ok") {
    return { safe: false, reason, targetsByStyleKey, sawCandidateMatch };
  }
  if (!sawUsage) {
    return { safe: false, reason: "no-usage", targetsByStyleKey, sawCandidateMatch };
  }
  if ([...targetsByStyleKey.values()].some((set) => set.size === 0)) {
    return {
      safe: false,
      reason: sawCandidateMatch ? "dynamic-usage" : "no-usage",
      targetsByStyleKey,
      sawCandidateMatch,
    };
  }
  return { safe: true, reason: "ok", targetsByStyleKey, sawCandidateMatch };
}

export function getLocalElementWarningType(
  override: LocalElementOverrideCandidate,
  reason: LocalElementProofReason,
):
  | "Unsupported selector: ambiguous element selector"
  | "Unsupported selector: descendant/child/sibling selector"
  | "Unsupported selector: element selector with dynamic children"
  | "Unsupported selector: element selector with plain intrinsic children" {
  if (reason === "no-usage") {
    return "Unsupported selector: descendant/child/sibling selector";
  }
  if (reason === "dynamic-usage" || reason === "unsupported-wrapper") {
    return "Unsupported selector: element selector with dynamic children";
  }
  if (reason === "child-not-inlineable" || reason === "non-jsx-usage") {
    return "Unsupported selector: ambiguous element selector";
  }
  return override.tagName === "svg" || override.tagName === "button"
    ? "Unsupported selector: element selector with plain intrinsic children"
    : "Unsupported selector: ambiguous element selector";
}

export function makeLocalElementTargetStyleKey(
  override: LocalElementOverrideCandidate,
  targetId: string,
): string {
  const targetName = targetId.startsWith("styled:")
    ? targetId.slice("styled:".length)
    : targetId.slice("intrinsic:".length);
  const normalizedTargetName =
    targetName[0]?.toLowerCase() === targetName[0]
      ? targetName
      : `${targetName[0]?.toLowerCase() ?? ""}${targetName.slice(1)}`;
  const relationPrefix = override.relation === "child" ? "child" : "descendant";
  const targetSuffix = camelToKebabCase(normalizedTargetName).replace(/-([a-z])/g, (_, c) =>
    c.toUpperCase(),
  );
  return `${relationPrefix}${targetSuffix[0]?.toUpperCase() ?? ""}${targetSuffix.slice(1)}`;
}

export function buildLocalElementOverrideProperties(args: {
  j: JSCodeshift;
  override: LocalElementOverrideCandidate;
  childStyleObjects: Array<Record<string, unknown>>;
}) {
  const { j, override, childStyleObjects } = args;
  return buildRelationOverrideProperties({
    j,
    pseudoBuckets: override.pseudoBuckets,
    childStyleObjects,
    makeCssPropKey,
    childPseudos: override.childPseudo ? new Set([override.childPseudo]) : undefined,
    markerVarName: undefined,
  });
}

export function hasPseudoLocalElementOverride(override: LocalElementOverrideCandidate): boolean {
  return [...override.pseudoBuckets.keys()].some((pseudo) => pseudo !== null);
}

function hasPseudoOnlyLocalElementOverride(override: LocalElementOverrideCandidate): boolean {
  return override.pseudoBuckets.size > 0 && !override.pseudoBuckets.has(null);
}

export function hasOverlappingPseudoOnlyLocalOverride(
  priorOverrides: LocalElementOverrideCandidate[],
  nextOverride: LocalElementOverrideCandidate,
  targetId: string,
): boolean {
  if (!hasPseudoOnlyLocalElementOverride(nextOverride)) {
    return false;
  }
  const nextProps = new Set(getLocalElementOverridePropNames(nextOverride));
  return priorOverrides.some((priorOverride) => {
    if (!hasPseudoOnlyLocalElementOverride(priorOverride)) {
      return false;
    }
    if (!priorOverride.styleKeysByTargetId?.[targetId]) {
      return false;
    }
    return getLocalElementOverridePropNames(priorOverride).some((prop) => nextProps.has(prop));
  });
}

function getLocalElementOverridePropNames(override: LocalElementOverrideCandidate): string[] {
  return [...override.pseudoBuckets.values()].flatMap((bucket) => Object.keys(bucket));
}

export function hasRuntimeStyleEntriesForLocalElementTarget(decl: StyledDecl): boolean {
  return (
    Object.keys(decl.variantStyleKeys ?? {}).length > 0 ||
    (decl.variantDimensions?.length ?? 0) > 0 ||
    (decl.staticBooleanVariants?.length ?? 0) > 0 ||
    (decl.callSiteCombinedStyles?.length ?? 0) > 0 ||
    (decl.styleFnFromProps?.length ?? 0) > 0 ||
    (decl.extraStylexPropsArgs?.length ?? 0) > 0
  );
}

export function buildResolvedStyleObjectList(
  decl: StyledDecl,
  resolvedStyleObjects: Map<string, unknown>,
): Array<Record<string, unknown>> {
  const afterBaseKeys = new Set(decl.extraStyleKeysAfterBase ?? []);
  const beforeBaseKeys: string[] = [];
  const afterBaseKeysInOrder: string[] = [];
  for (const key of decl.extraStyleKeys ?? []) {
    if (afterBaseKeys.has(key)) {
      afterBaseKeysInOrder.push(key);
    } else {
      beforeBaseKeys.push(key);
    }
  }
  const keys = [
    ...afterBaseKeysInOrder.reverse(),
    decl.styleKey,
    ...beforeBaseKeys.reverse(),
    ...(decl.extendsStyleKey ? [decl.extendsStyleKey] : []),
  ];
  const results: Array<Record<string, unknown>> = [];
  for (const key of keys) {
    const value = resolvedStyleObjects.get(key);
    results.push(...getPlainStyleObjectsFromResolvedValue(value));
  }
  return results;
}

export function getPlainStyleObjectsFromResolvedValue(
  value: unknown,
): Array<Record<string, unknown>> {
  if (isPlainStyleObject(value)) {
    return [value];
  }
  if (isAstNode(value) && (value as { type?: string }).type === "ObjectExpression") {
    const converted = objectExpressionToPlainStyleObject(
      value as {
        properties?: Array<{
          type?: string;
          key?: { type?: string; name?: string; value?: unknown };
          value?: unknown;
        }>;
      },
    );
    return converted ? [converted] : [];
  }
  return [];
}

function objectExpressionToPlainStyleObject(node: {
  properties?: Array<{
    type?: string;
    key?: { type?: string; name?: string; value?: unknown };
    value?: unknown;
  }>;
}): Record<string, unknown> | null {
  const result: Record<string, unknown> = {};
  for (const property of node.properties ?? []) {
    if (property.type !== "Property") {
      return null;
    }
    const key =
      property.key?.type === "Identifier"
        ? property.key.name
        : property.key?.type === "Literal" || property.key?.type === "StringLiteral"
          ? String(property.key.value)
          : null;
    if (!key) {
      return null;
    }
    result[key] = property.value;
  }
  return result;
}

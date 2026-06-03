/**
 * Shared helpers for collecting JSX prop usage observations.
 */

import type { ComponentPropUsageInfo, StaticPropValue } from "../transform-types.js";

export type ObservedPropValue = { kind: "static"; value: StaticPropValue } | { kind: "unknown" };

export interface ComponentPropUsageCandidate {
  props: Record<string, ObservedPropValue>;
  hasSpread: boolean;
}

export const KNOWN_NON_ELEMENT_PROPS = new Set([
  "className",
  "style",
  "as",
  "ref",
  "forwardedAs",
  "key",
  "children",
]);

export function createComponentPropUsageInfo(name: string): ComponentPropUsageInfo {
  return {
    componentName: name,
    usageCount: 0,
    hasUnknownUsage: false,
    props: {},
  };
}

export function mergeComponentPropUsage(
  info: ComponentPropUsageInfo,
  usage: ComponentPropUsageCandidate,
): void {
  info.usageCount += 1;
  if (usage.hasSpread) {
    info.hasUnknownUsage = true;
  }

  const presentProps = new Set(Object.keys(usage.props));
  for (const [propName, propInfo] of Object.entries(info.props)) {
    if (!presentProps.has(propName)) {
      propInfo.omittedCount += 1;
    }
  }

  for (const [propName, value] of Object.entries(usage.props)) {
    const propInfo =
      info.props[propName] ??
      (info.props[propName] = {
        values: [],
        hasUnknown: false,
        usageCount: 0,
        omittedCount: info.usageCount - 1,
      });
    propInfo.usageCount += 1;
    if (value.kind === "unknown") {
      propInfo.hasUnknown = true;
      continue;
    }
    if (!propInfo.values.some((existing) => existing === value.value)) {
      propInfo.values.push(value.value);
    }
  }
}

/**
 * Formats a `prop === value` JS condition for an observed static variant bucket,
 * quoting strings and emitting numbers bare. Shared by every observed-variant emitter.
 */
export function formatObservedVariantCondition(propName: string, value: string | number): string {
  const valueExpr = typeof value === "number" ? String(value) : JSON.stringify(value);
  return `${propName} === ${valueExpr}`;
}

export function getExhaustiveObservedStaticValues(
  info: ComponentPropUsageInfo | undefined,
  propName: string,
): Array<string | number> | null {
  const propUsage = info?.props[propName];
  if (!info || info.hasUnknownUsage || !propUsage || propUsage.hasUnknown) {
    return null;
  }
  if (propUsage.values.length < 1) {
    return null;
  }
  const values = propUsage.values.filter(
    (value: StaticPropValue): value is string | number =>
      typeof value === "string" || typeof value === "number",
  );
  return values.length === propUsage.values.length ? values : null;
}

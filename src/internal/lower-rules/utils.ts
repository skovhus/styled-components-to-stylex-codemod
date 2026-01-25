import { isAstNode } from "../jscodeshift-utils.js";

export function ensureStyleMapWithDefault(
  existing: unknown,
  baseValue: unknown,
): Record<string, unknown> {
  const map = (isPlainObject(existing) ? existing : {}) as Record<string, unknown>;
  if (!("default" in map)) {
    const fallback = existing ?? baseValue;
    map.default = fallback ?? null;
  }
  return map;
}

export function toKebab(s: string): string {
  return s
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .replace(/[^a-zA-Z0-9-]/g, "-")
    .toLowerCase();
}

export function mergeStyleObjects(
  target: Record<string, unknown>,
  source: Record<string, unknown>,
) {
  for (const [key, value] of Object.entries(source)) {
    const existing = (target as any)[key];
    if (
      existing &&
      value &&
      typeof existing === "object" &&
      typeof value === "object" &&
      !Array.isArray(existing) &&
      !Array.isArray(value) &&
      !isAstNode(existing) &&
      !isAstNode(value)
    ) {
      mergeStyleObjects(existing as Record<string, unknown>, value as Record<string, unknown>);
    } else {
      (target as any)[key] = value as any;
    }
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value) && !isAstNode(value);
}

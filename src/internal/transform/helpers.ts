import type { API } from "jscodeshift";

import { isAstNode } from "../utilities/jscodeshift-utils.js";
import type { WarningLog } from "../logger.js";
import type { UnsupportedCssUsage } from "./css-helpers.js";

export function toStyleKey(name: string): string {
  return name.charAt(0).toLowerCase() + name.slice(1);
}

export function objectToAst(j: API["jscodeshift"], obj: Record<string, unknown>): any {
  const spreadsRaw = obj.__spreads;
  const propCommentsRaw = (obj as any).__propComments;
  const spreads =
    Array.isArray(spreadsRaw) && spreadsRaw.every((s) => typeof s === "string")
      ? (spreadsRaw as string[])
      : [];
  const propComments: Record<string, any> =
    propCommentsRaw && typeof propCommentsRaw === "object" && !Array.isArray(propCommentsRaw)
      ? (propCommentsRaw as Record<string, any>)
      : {};

  const props: any[] = [];

  for (const s of spreads) {
    props.push(j.spreadElement(j.identifier(s)));
  }

  for (const [key, value] of Object.entries(obj)) {
    if (key === "__spreads") {
      continue;
    }
    if (key === "__propComments") {
      continue;
    }
    const keyNode =
      /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(key) &&
      !key.startsWith(":") &&
      !key.startsWith("@") &&
      !key.startsWith("::")
        ? j.identifier(key)
        : j.literal(key);
    const prop = j.property(
      "init",
      keyNode as any,
      value && typeof value === "object" && !isAstNode(value)
        ? objectToAst(j, value as Record<string, unknown>)
        : literalToAst(j, value),
    );

    const commentEntry = propComments[key];
    const leading =
      typeof commentEntry === "string"
        ? commentEntry
        : commentEntry && typeof commentEntry === "object"
          ? (commentEntry.leading as unknown)
          : null;
    const trailingLine =
      commentEntry && typeof commentEntry === "object"
        ? (commentEntry.trailingLine as unknown)
        : null;
    const comments: any[] = [];
    if (typeof leading === "string" && leading.trim()) {
      const trimmed = leading.trim();
      comments.push({
        type: "CommentBlock",
        value: ` ${trimmed} `,
        leading: true,
        trailing: false,
      });
    }
    if (typeof trailingLine === "string" && trailingLine.trim()) {
      const trimmed = trailingLine.trim();
      // NOTE: Recast/oxfmt will often render this as a standalone comment line above the property.
      // We normalize it back to an inline trailing comment in `formatOutput`.
      comments.push({
        type: "CommentLine",
        value: ` ${trimmed}`,
        leading: false,
        trailing: true,
      });
    }
    if (comments.length) {
      (prop as any).comments = comments;
    }

    props.push(prop);
  }
  return j.objectExpression(props);
}

export function literalToAst(j: API["jscodeshift"], value: unknown): any {
  if (isAstNode(value)) {
    return value;
  }
  if (value === null) {
    return j.literal(null);
  }
  if (typeof value === "string") {
    return j.literal(value);
  }
  if (typeof value === "number") {
    return j.literal(value);
  }
  if (typeof value === "boolean") {
    return j.literal(value);
  }
  if (typeof value === "undefined") {
    return j.identifier("undefined");
  }
  if (typeof value === "bigint") {
    return j.literal(value.toString());
  }
  if (typeof value === "symbol") {
    return j.literal(value.description ?? "");
  }
  if (typeof value === "function") {
    return j.literal("[Function]");
  }
  if (typeof value === "object") {
    try {
      return j.literal(JSON.stringify(value));
    } catch {
      return j.literal("[Object]");
    }
  }
  // fallback (should be unreachable, but keep it defensive)
  return j.literal("[Unknown]");
}

export function cssValueToJs(value: any, important = false, propName?: string): unknown {
  if (value.kind === "static") {
    const raw = String(value.value);
    // Preserve `!important` by emitting a string value that includes it.
    // (StyleX supports `!important` in values and this is necessary to override inline styles.)
    if (important) {
      if (propName === "borderStyle") {
        return raw;
      }
      return raw.includes("!important") ? raw : `${raw} !important`;
    }

    // Try to return number if purely numeric and no unit.
    if (/^-?\d+(\.\d+)?$/.test(raw)) {
      if (propName === "flex") {
        return raw;
      }
      return Number(raw);
    }
    return raw;
  }
  // interpolated values are handled earlier for now
  return "";
}

export function toSuffixFromProp(propName: string): string {
  // `$isActive` => `IsActive`, `primary` => `Primary`
  const raw = propName.startsWith("$") ? propName.slice(1) : propName;
  if (!raw) {
    return "Variant";
  }

  // Handle simple expression keys coming from the dynamic resolution pipeline, e.g.:
  //   `size === "large"` -> `SizeLarge`
  //   `variant === "primary"` -> `VariantPrimary`
  //   `!isActive` -> `NotActive`
  const trimmed = raw.trim();

  // Handle simple compound expressions (used for compound variant buckets), e.g.:
  //   `disabled && color === "primary"` -> `DisabledColorPrimary`
  if (trimmed.includes("&&")) {
    const parts = trimmed
      .split("&&")
      .map((s) => s.trim())
      .filter(Boolean);
    if (parts.length) {
      return parts.map((p) => toSuffixFromProp(p)).join("");
    }
  }

  if (trimmed.startsWith("!")) {
    const inner = trimmed
      .slice(1)
      .trim()
      .replace(/^\(|\)$/g, "");
    const base = toSuffixFromProp(inner);
    return `Not${base}`;
  }
  const eq = trimmed.includes("!==") ? "!==" : trimmed.includes("===") ? "===" : null;
  if (eq) {
    const [lhs0, rhs0] = trimmed.split(eq).map((s) => s.trim());
    const lhs = lhs0 ?? "Variant";
    const rhsRaw = (rhs0 ?? "").replace(/^['"]|['"]$/g, "");
    const rhs = rhsRaw || (eq === "!==" ? "NotMatch" : "Match");
    const lhsSuffix = lhs.charAt(0).toUpperCase() + lhs.slice(1);
    const rhsSuffix = rhs.charAt(0).toUpperCase() + rhs.slice(1);
    return eq === "!==" ? `${lhsSuffix}Not${rhsSuffix}` : `${lhsSuffix}${rhsSuffix}`;
  }

  // Common boolean convention: `$isActive` -> `Active` (matches existing fixtures)
  if (raw.startsWith("is") && raw.length > 2 && /[A-Z]/.test(raw[2]!)) {
    return raw.slice(2);
  }
  return raw.charAt(0).toUpperCase() + raw.slice(1);
}

export function buildUnsupportedCssWarnings(usages: UnsupportedCssUsage[]): WarningLog[] {
  return usages.map((usage) => ({
    severity: "warning" as const,
    type:
      usage.reason === "call-expression"
        ? ("`css` helper usage as a function call (css(...)) is not supported" as const)
        : ("`css` helper used outside of a styled component template cannot be statically transformed" as const),
    loc: usage.loc ?? undefined,
  }));
}

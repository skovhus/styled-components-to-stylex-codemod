/**
 * Helper utilities for transform naming and AST conversions.
 * Core concepts: style key naming and literal serialization.
 */
import type { API } from "jscodeshift";

import { isStylexStringOnlyCssProp } from "../css-prop-mapping.js";
import { isAstNode } from "../utilities/jscodeshift-utils.js";
import { normalizeWhitespace } from "../utilities/string-utils.js";
import type { WarningLog } from "../logger.js";
import type { UnsupportedCssUsage } from "./css-helpers.js";

export function toStyleKey(name: string): string {
  // If the entire name is uppercase (e.g. "SVG", "URL"), lowercase it entirely
  if (/^[A-Z]+$/.test(name)) {
    return name.toLowerCase();
  }
  // If it starts with consecutive uppercase chars (e.g. "SVGIcon"), lowercase the
  // leading acronym portion except the last char which starts the next word
  const leadingUpper = name.match(/^[A-Z]+/);
  if (leadingUpper && leadingUpper[0].length > 1) {
    const acronymLen = leadingUpper[0].length;
    // If the entire string is the acronym, lowercase all
    if (acronymLen === name.length) {
      return name.toLowerCase();
    }
    // Lowercase all but the last uppercase char (which starts the next word)
    return name.slice(0, acronymLen - 1).toLowerCase() + name.slice(acronymLen - 1);
  }
  return name.charAt(0).toLowerCase() + name.slice(1);
}

/** Strip "styled"/"Styled" prefix when followed by an uppercase letter (e.g. StyledButton → Button). */
export function stripStyledPrefix(name: string): string {
  if (/^[sS]tyled[A-Z]/.test(name)) {
    return name.slice(6);
  }
  return name;
}

/**
 * Entry for a computed property key in style objects.
 * Used for dynamic keys like `[breakpoints.phone]` in StyleX styles.
 */
export type ComputedKeyEntry = {
  /** AST node for the computed key expression */
  keyExpr: unknown;
  /** The value (can be nested object, string, number, etc.) */
  value: unknown;
  /** Optional leading comment to attach to the emitted property */
  leadingComment?: string;
  /** Original CSS custom property name when this computed key represents a rewritten definition. */
  originalCssVariableName?: string;
  /**
   * When true, emit this entry before regular string-keyed properties (e.g. for
   * CSS-variable definitions like `[vars.spacingSm]: "24px"` that should appear
   * at the top of the rule). Default (false) emits at the end (e.g. media queries).
   */
  prepend?: boolean;
};

export type PropCommentMetadata = {
  leading?: string | null;
  leadingLine?: string | null;
  trailingLine?: string | null;
};

export const SOURCE_CSS_PROPERTIES_KEY = "__sourceCssProperties";

function propCommentMetadataToAstComments(
  commentEntry: string | PropCommentMetadata | null | undefined,
): any[] {
  const leading =
    typeof commentEntry === "string"
      ? commentEntry
      : commentEntry && typeof commentEntry === "object"
        ? (commentEntry.leading as unknown)
        : null;
  const leadingLine =
    commentEntry && typeof commentEntry === "object" ? (commentEntry.leadingLine as unknown) : null;
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
  if (typeof leadingLine === "string" && leadingLine.trim()) {
    for (const line of leadingLine.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed) {
        continue;
      }
      comments.push({
        type: "CommentLine",
        value: ` ${trimmed}`,
        leading: true,
        trailing: false,
      });
    }
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
  return comments;
}

export function objectToAst(j: API["jscodeshift"], obj: Record<string, unknown>): any {
  const spreadsRaw = obj.__spreads;
  const propCommentsRaw = (obj as any).__propComments;
  const computedKeysRaw = (obj as any).__computedKeys;
  const spreads =
    Array.isArray(spreadsRaw) && spreadsRaw.every((s) => typeof s === "string")
      ? (spreadsRaw as string[])
      : [];
  const propComments: Record<string, any> =
    propCommentsRaw && typeof propCommentsRaw === "object" && !Array.isArray(propCommentsRaw)
      ? (propCommentsRaw as Record<string, any>)
      : {};
  const computedKeys: ComputedKeyEntry[] = Array.isArray(computedKeysRaw)
    ? (computedKeysRaw as ComputedKeyEntry[])
    : [];

  const props: any[] = [];

  for (const s of spreads) {
    props.push(j.spreadElement(j.identifier(s)));
  }

  for (const entry of computedKeys) {
    if (!entry.prepend) {
      continue;
    }
    const prop = computedKeyEntryToProp(j, entry);
    if (prop) {
      props.push(prop);
    }
  }

  for (const [key, value] of Object.entries(obj)) {
    if (key === "__spreads") {
      continue;
    }
    if (key === "__propComments") {
      continue;
    }
    if (key === "__computedKeys") {
      continue;
    }
    if (key === SOURCE_CSS_PROPERTIES_KEY) {
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

    const comments = propCommentMetadataToAstComments(propComments[key]);
    if (comments.length) {
      (prop as any).comments = comments;
    }

    props.push(prop);
  }

  // Emit non-prepend computed key properties (e.g., [breakpoints.phone]: value)
  for (const entry of computedKeys) {
    if (entry.prepend) {
      continue;
    }
    const prop = computedKeyEntryToProp(j, entry);
    if (prop) {
      props.push(prop);
    }
  }

  return j.objectExpression(props);
}

function computedKeyEntryToProp(j: API["jscodeshift"], entry: ComputedKeyEntry): any {
  if (!entry.keyExpr || !isAstNode(entry.keyExpr)) {
    return null;
  }
  const valueAst =
    entry.value && typeof entry.value === "object" && !isAstNode(entry.value)
      ? objectToAst(j, entry.value as Record<string, unknown>)
      : literalToAst(j, entry.value);
  const prop = j.property("init", entry.keyExpr as any, valueAst);
  (prop as any).computed = true;
  if (entry.leadingComment) {
    (prop as any).comments = [
      {
        type: "CommentLine",
        value: ` ${entry.leadingComment}`,
        leading: true,
        trailing: false,
      },
    ];
  }
  return prop;
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
    const raw = normalizeStaticCssValueWhitespace(String(value.value), propName);
    // Preserve `!important` by emitting a string value that includes it.
    // (StyleX supports `!important` in values and this is necessary to override inline styles.)
    if (important) {
      return raw.includes("!important") ? raw : `${raw} !important`;
    }

    // CSS custom properties must stay as strings: downstream var-rewrite
    // logic (`localVarValues`, `rewriteCssVarsInString`, `dropDefinition`)
    // relies on `typeof value === "string"`.
    if (propName?.startsWith("--")) {
      return raw;
    }

    // Some React/CSS properties accept unitless numbers but StyleX types them
    // as strings, so keep numeric CSS text as string literals for those props.
    if (propName && isStylexStringOnlyCssProp(propName)) {
      return raw;
    }

    // Try to return number if purely numeric and no unit.
    if (/^-?\d*\.?\d+$/.test(raw)) {
      if (propName === "flex") {
        return raw;
      }
      return Number(raw);
    }

    // StyleX defaults to pixels for length properties; convert "26px" → 26.
    const pxMatch = /^(-?\d*\.?\d+)px$/.exec(raw);
    if (pxMatch) {
      if (propName === "lineHeight") {
        return raw;
      }
      return Number(pxMatch[1]);
    }

    return raw;
  }
  // interpolated values are handled earlier for now
  return "";
}

/**
 * Normalizes a CSS `content` property value for StyleX.
 * CSS `content` requires quoted strings; this ensures the value is properly double-quoted.
 */
export function normalizeCssContentValue(value: string): string {
  if (isCssContentNonStringValue(value.trim())) {
    return value.trim();
  }
  const m = value.match(/^['"]([\s\S]*)['"]$/);
  if (m) {
    return `"${m[1]}"`;
  }
  if (!value.startsWith('"') && !value.endsWith('"')) {
    return `"${value}"`;
  }
  return value;
}

function isCssContentNonStringValue(value: string): boolean {
  return (
    /^(attr|counter|counters)\s*\(/i.test(value) ||
    /^(open-quote|close-quote|no-open-quote|no-close-quote|normal|none)$/i.test(value)
  );
}

// Re-export from style-key-naming.ts for backwards compatibility
export { styleKeyWithSuffix, toSuffixFromProp } from "../utilities/style-key-naming.js";

export function buildUnsupportedCssWarnings(usages: UnsupportedCssUsage[]): WarningLog[] {
  return usages.map((usage) => {
    let type: WarningLog["type"];
    if (usage.reason === "call-expression") {
      type = "`css` helper usage as a function call (css(...)) is not supported";
    } else if (usage.reason === "closure-variable") {
      type =
        "css`` helper function interpolation references closure variable that cannot be hoisted";
    } else {
      type =
        "`css` helper used outside of a styled component template cannot be statically transformed";
    }
    return {
      severity: "warning" as const,
      type,
      loc: usage.loc ?? undefined,
      context: usage.closureVariable ? { variable: usage.closureVariable } : undefined,
    };
  });
}

function normalizeStaticCssValueWhitespace(raw: string, propName?: string): string {
  if (propName?.startsWith("animation")) {
    return raw.replace(/,(\S)/g, ", $1");
  }
  // Preserve authored whitespace for most properties. Normalize only gradient
  // background-image values to avoid escaped \n sequences in generated output.
  if (propName !== "backgroundImage") {
    return raw;
  }
  // Skip URL values — they may contain gradient-like text inside the payload
  // (e.g., data URIs with embedded SVG or filenames like "icon-linear-gradient.svg")
  // that should not be modified. Only normalize actual top-level gradient functions.
  if (/^\s*url\s*\(/i.test(raw)) {
    return raw;
  }
  if (
    !/\b(linear|radial|conic|repeating-linear|repeating-radial|repeating-conic)-gradient\s*\(/.test(
      raw,
    )
  ) {
    return raw;
  }
  return normalizeWhitespace(raw).replace(/\(\s+/g, "(").replace(/\s+\)/g, ")");
}

/**
 * Helpers extracted from rule-interpolated-declaration.ts.
 * Keep behavior identical to the original inline definitions.
 */
import {
  borderLonghandProps,
  cssPropertyToStylexProp,
  isCssShorthandProperty,
  parseBorderShorthandParts,
  resolveBackgroundStylexProp,
} from "../css-prop-mapping.js";
import type { StyledDecl } from "../transform-types.js";
import { appendImportantToStyleValue } from "./important-values.js";
import type { JSCodeshift } from "jscodeshift";

/**
 * Apply a resolved theme boolean value to a style object, expanding CSS shorthands.
 * Returns false if the value cannot be expanded (caller should bail).
 */
export function applyThemeBooleanValue(
  j: JSCodeshift,
  cssProp: string,
  value: unknown,
  target: Record<string, unknown>,
  important: boolean,
  cssValueText?: string,
): boolean {
  // Try to extract string value from AST node (shared across border/background paths)
  const node = value as { type?: string; value?: unknown; expression?: unknown } | null;
  const unwrapped = node?.type === "ExpressionStatement" ? (node.expression as typeof node) : node;
  const strValue =
    unwrapped &&
    (unwrapped.type === "StringLiteral" || unwrapped.type === "Literal") &&
    typeof unwrapped.value === "string"
      ? unwrapped.value
      : null;

  // Border shorthand → expand to width/style/color
  const borderLonghand = borderLonghandProps(cssProp);
  if (borderLonghand) {
    if (strValue === null) {
      return false;
    }
    const { widthProp, styleProp, colorProp } = borderLonghand;
    const parsed = parseBorderShorthandParts(strValue);
    if (!parsed) {
      return false;
    }
    if (parsed.width) {
      target[widthProp] = appendImportantToStyleValue(j, j.literal(parsed.width), important);
    }
    if (parsed.style) {
      target[styleProp] = appendImportantToStyleValue(j, j.literal(parsed.style), important);
    }
    if (parsed.color) {
      target[colorProp] = appendImportantToStyleValue(j, j.literal(parsed.color), important);
    }
    return true;
  }

  // Background shorthand → backgroundColor or backgroundImage
  // Use the actual branch value (not valueRaw which contains placeholders)
  if (cssProp === "background") {
    const backgroundText = strValue ?? cssValueText ?? "";
    if (backgroundText.trim() === "none") {
      target.backgroundImage = appendImportantToStyleValue(j, j.literal("none"), important);
      target.backgroundColor = appendImportantToStyleValue(j, j.literal("transparent"), important);
      return true;
    }
    const backgroundProp = resolveBackgroundStylexProp(backgroundText);
    target[backgroundProp] = appendImportantToStyleValue(j, value, important);
    applyBackgroundShorthandLayerReset(j, target, backgroundProp, important);
    return true;
  }

  if (isCssShorthandProperty(cssProp)) {
    return false;
  }

  // Default: camelCase the property name
  target[cssPropertyToStylexProp(cssProp)] = appendImportantToStyleValue(j, value, important);
  return true;
}

export function restoreThemeStyleKeyFromPairedSide(
  targetBaseKey: string,
  pairedBaseKey: string,
  pairedStyleKey: string | null,
): string {
  if (pairedStyleKey?.startsWith(pairedBaseKey)) {
    return `${targetBaseKey}${pairedStyleKey.slice(pairedBaseKey.length)}`;
  }
  return targetBaseKey;
}

export function getLatestThemeInterleavableSourceOrder(args: {
  decl: StyledDecl;
  variantSourceOrder: Record<string, number>;
  styleFnFromProps: Array<{ sourceOrder?: number }>;
}): number {
  const sourceOrders = Object.values(args.variantSourceOrder);
  appendSourceOrders(sourceOrders, args.styleFnFromProps);
  appendSourceOrders(sourceOrders, args.decl.needsUseThemeHook);
  appendSourceOrders(sourceOrders, args.decl.pseudoAliasSelectors);
  appendSourceOrders(sourceOrders, args.decl.variantDimensions);
  return sourceOrders.length > 0 ? Math.max(...sourceOrders) : -1;
}

function appendSourceOrders(
  sourceOrders: number[],
  entries: readonly { sourceOrder?: number }[] | undefined,
): void {
  for (const entry of entries ?? []) {
    if (entry.sourceOrder !== undefined) {
      sourceOrders.push(entry.sourceOrder);
    }
  }
}

type BackgroundLayerStylexProp = "backgroundImage" | "backgroundColor";

export function applyBackgroundShorthandLayerReset(
  j: JSCodeshift,
  target: Record<string, unknown>,
  backgroundProp: BackgroundLayerStylexProp,
  important: boolean,
): void {
  if (backgroundProp === "backgroundColor") {
    target.backgroundImage = appendImportantToStyleValue(j, j.literal("none"), important);
    return;
  }
  target.backgroundColor = appendImportantToStyleValue(j, j.literal("transparent"), important);
}

export function resolveRuntimeBackgroundStylexProp(
  value: unknown,
  cssValueText?: string,
): BackgroundLayerStylexProp | "unsupported" | null {
  const node = unwrapExpressionNode(value);
  if (node?.type !== "ConditionalExpression") {
    const staticText = getRuntimeBackgroundStaticText(node);
    if (staticText !== null) {
      return resolveBackgroundStylexProp(staticText);
    }
    return cssValueText ? resolveBackgroundStylexProp(cssValueText) : null;
  }

  const consequentProp = classifyRuntimeBackgroundBranch(node.consequent);
  const alternateProp = classifyRuntimeBackgroundBranch(node.alternate);
  if (consequentProp && alternateProp) {
    return consequentProp === alternateProp ? consequentProp : "unsupported";
  }

  const cssTextProp = cssValueText ? resolveBackgroundStylexProp(cssValueText) : null;
  const knownProp = consequentProp ?? alternateProp;
  if (knownProp) {
    if (knownProp === "backgroundImage") {
      return "unsupported";
    }
    if (cssTextProp && cssTextProp !== knownProp) {
      return "unsupported";
    }
    return "backgroundColor";
  }
  if (cssTextProp === "backgroundImage") {
    return "unsupported";
  }
  return "backgroundColor";
}

function classifyRuntimeBackgroundBranch(value: unknown): BackgroundLayerStylexProp | null {
  const staticText = getRuntimeBackgroundStaticText(unwrapExpressionNode(value));
  return staticText === null ? null : resolveBackgroundStylexProp(staticText);
}

function unwrapExpressionNode(value: unknown): {
  type?: string;
  expression?: unknown;
  consequent?: unknown;
  alternate?: unknown;
  quasis?: Array<{ value?: { cooked?: string | null; raw?: string } }>;
  value?: unknown;
} | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const node = value as {
    type?: string;
    expression?: unknown;
    consequent?: unknown;
    alternate?: unknown;
    quasis?: Array<{ value?: { cooked?: string | null; raw?: string } }>;
    value?: unknown;
  };
  if (
    node.type === "ExpressionStatement" ||
    node.type === "TSAsExpression" ||
    node.type === "TSSatisfiesExpression"
  ) {
    return unwrapExpressionNode(node.expression);
  }
  return node;
}

function getRuntimeBackgroundStaticText(
  value: ReturnType<typeof unwrapExpressionNode>,
): string | null {
  if (!value) {
    return null;
  }
  if (
    (value.type === "StringLiteral" || value.type === "Literal") &&
    typeof value.value === "string"
  ) {
    return value.value;
  }
  if (value.type === "TemplateLiteral") {
    const text = (value.quasis ?? [])
      .map((quasi) => quasi.value?.cooked ?? quasi.value?.raw ?? "")
      .join("");
    return text || null;
  }
  return null;
}

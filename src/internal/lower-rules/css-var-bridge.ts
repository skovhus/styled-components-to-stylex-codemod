/**
 * CSS-var bridge forwarding for cross-component descendant selectors.
 *
 * When a forward descendant selector contains prop-based interpolations that
 * cannot be resolved statically, these helpers bridge them via CSS custom
 * properties: the parent sets the variable as an inline style and the child's
 * override style references it via `var()`.
 */
import type { DeclProcessingState } from "./decl-setup.js";
import type { StyledDecl } from "../transform-types.js";
import type { CssDeclarationIR, CssValuePart } from "../css-ir.js";
import { cssDeclarationToStylexDeclarations } from "../css-prop-mapping.js";
import { cssValueToJs } from "../transform/helpers.js";
import { kebabToCamelCase } from "../utilities/string-utils.js";
import { getOrCreateRelationOverrideBucket } from "./shared.js";
import { ensureShouldForwardPropDrop } from "./types.js";
import type { ExpressionKind } from "./decl-types.js";
import {
  hasThemeAccessInArrowFn,
  inlineArrowFunctionBody,
  collectPropsFromArrowFnDestructured,
} from "./inline-styles.js";
import { setStyleObjectValue } from "./utils.js";
import { writeResolvedDeclaration } from "./decl-bucket-resolution.js";

export function getFirstAncestorPseudo(ancestorPseudos: string | string[] | null): string | null {
  return Array.isArray(ancestorPseudos) ? (ancestorPseudos[0] ?? null) : ancestorPseudos;
}

export function copyWrittenPropsToRemainingAncestorPseudoBuckets(args: {
  ctx: DeclProcessingState;
  ancestorPseudos: string[];
  sourceBucket: Record<string, unknown>;
  writtenProps: ReadonlySet<string>;
  overrideStyleKey: string;
  parentStyleKey: string;
  childStyleKey: string;
  childExtraStyleKeys?: string[];
}): void {
  const {
    ctx,
    ancestorPseudos,
    sourceBucket,
    writtenProps,
    overrideStyleKey,
    parentStyleKey,
    childStyleKey,
    childExtraStyleKeys,
  } = args;
  const { relationOverrides, relationOverridePseudoBuckets } = ctx.state;

  for (const ancestorPseudo of ancestorPseudos.slice(1)) {
    const bucket = getOrCreateRelationOverrideBucket(
      overrideStyleKey,
      parentStyleKey,
      childStyleKey,
      ancestorPseudo,
      relationOverrides,
      relationOverridePseudoBuckets,
      childExtraStyleKeys,
    );
    for (const key of writtenProps) {
      setStyleObjectValue(bucket, key, sourceBucket[key]);
    }
  }
}

export function tryForwardCssVarBridgeForAncestorPseudos(args: {
  ctx: DeclProcessingState;
  rule: { declarations: CssDeclarationIR[] };
  firstBucket: Record<string, unknown>;
  overrideStyleKey: string;
  childStyleKey: string;
  ancestorPseudos: string | string[] | null;
  firstAncestorPseudo: string | null;
}): boolean {
  const {
    ctx,
    rule,
    firstBucket,
    overrideStyleKey,
    childStyleKey,
    ancestorPseudos,
    firstAncestorPseudo,
  } = args;
  const { state, decl, inlineStyleProps } = ctx;
  const { j, resolveThemeValue, resolveThemeValueFromFn } = state;

  const bridgeResult = tryForwardCssVarBridge(
    rule,
    firstBucket,
    j,
    decl,
    overrideStyleKey,
    resolveThemeValue,
    resolveThemeValueFromFn,
    inlineStyleProps,
    firstAncestorPseudo,
  );
  if (bridgeResult === "bail") {
    return false;
  }

  if (!Array.isArray(ancestorPseudos)) {
    return true;
  }

  for (const ancestorPseudo of ancestorPseudos.slice(1)) {
    const extraBucket = getOrCreateRelationOverrideBucket(
      overrideStyleKey,
      decl.styleKey,
      childStyleKey,
      ancestorPseudo,
      state.relationOverrides,
      state.relationOverridePseudoBuckets,
    );
    const extraBridgeResult = tryForwardCssVarBridge(
      rule,
      extraBucket,
      j,
      decl,
      overrideStyleKey,
      resolveThemeValue,
      resolveThemeValueFromFn,
      inlineStyleProps,
      ancestorPseudo,
    );
    if (extraBridgeResult === "bail") {
      return false;
    }
  }

  return true;
}

/**
 * Attempts to resolve unresolvable interpolations in a forward descendant selector
 * by bridging them via CSS custom properties. The parent component sets the CSS
 * variable as an inline style, and the child's override style references it via `var()`.
 *
 * Only handles single-slot interpolations that are arrow function prop accesses.
 * Returns "bail" if the bridge can't be applied.
 */
function tryForwardCssVarBridge(
  rule: { declarations: CssDeclarationIR[] },
  bucket: Record<string, unknown>,
  j: DeclProcessingState["state"]["j"],
  decl: StyledDecl,
  overrideStyleKey: string,
  resolveThemeValue: (expr: unknown) => unknown,
  resolveThemeValueFromFn: (expr: unknown) => unknown,
  parentInlineStyleProps: Array<{
    prop: string;
    expr: ExpressionKind;
    jsxProp?: string;
  }>,
  ancestorPseudo: string | null,
): Set<string> | "bail" {
  const writtenProps = new Set<string>();

  for (const d of rule.declarations) {
    // Static and theme-resolvable declarations use the shared helper
    const sharedResult = writeResolvedDeclaration(
      d,
      bucket,
      j,
      decl,
      resolveThemeValue,
      resolveThemeValueFromFn,
      writtenProps,
    );
    if (sharedResult === "written" || sharedResult === "skip") {
      continue;
    }

    // sharedResult === "unresolved" — try CSS variable bridge for prop-based expressions
    if (d.value.kind !== "interpolated" || !d.property) {
      return "bail";
    }
    const slotParts = d.value.parts.filter(
      (p): p is CssValuePart & { kind: "slot" } => p.kind === "slot",
    );
    // Only handle single-slot interpolations for now
    const singleSlot = slotParts.length === 1 ? slotParts[0] : undefined;
    if (!singleSlot) {
      return "bail";
    }
    const slotId = singleSlot.slotId;
    const expr = decl.templateExpressions[slotId];
    if (
      !expr ||
      typeof expr !== "object" ||
      ((expr as { type?: string }).type !== "ArrowFunctionExpression" &&
        (expr as { type?: string }).type !== "FunctionExpression")
    ) {
      return "bail";
    }

    // Reject theme accesses — they should be handled by resolveThemeValueFromFn
    if (hasThemeAccessInArrowFn(expr)) {
      return "bail";
    }

    // Inline the arrow function body to get a wrapper-scope expression
    const inlinedExpr = inlineArrowFunctionBody(j, expr);
    if (!inlinedExpr) {
      return "bail";
    }

    // Collect and register used props so the wrapper destructures them.
    // Uses the destructured-aware variant so `({ $color }) => $color` patterns
    // also register shouldForwardProp drops for the bridged props.
    for (const propName of collectPropsFromArrowFnDestructured(expr)) {
      ensureShouldForwardPropDrop(decl, propName);
    }

    // Generate a CSS variable name from the override style key, ancestor pseudo (if any),
    // and CSS property. Including the pseudo ensures unique var names when multiple pseudos
    // target the same child with the same property (e.g., &:hover ${C} and &:focus ${C}).
    const pseudoSegment = ancestorPseudo
      ? `-${kebabToCamelCase(ancestorPseudo.replace(/^:/, ""))}`
      : "";
    const varName = `--${overrideStyleKey}${pseudoSegment}-${kebabToCamelCase(d.property)}`;

    // Set bucket value(s) — shorthand expansion may produce multiple outputs.
    // Compose static parts with the var() reference to preserve prefixes/suffixes
    // (e.g., `box-shadow: 0 4px 8px ${color}` → `"0 4px 8px var(--name)"`).
    for (const out of cssDeclarationToStylexDeclarations(d)) {
      if (out.value.kind === "static") {
        setStyleObjectValue(bucket, out.prop, cssValueToJs(out.value, d.important, out.prop));
      } else {
        setStyleObjectValue(bucket, out.prop, composeVarReference(out.value.parts, varName));
      }
      writtenProps.add(out.prop);
    }

    // Add CSS variable assignment to the parent's inline style props
    parentInlineStyleProps.push({ prop: varName, expr: inlinedExpr });
    decl.needsWrapperComponent = true;
  }

  return writtenProps;
}

/**
 * Builds a CSS value string from parts, replacing slot references with `var(--name)`.
 * Preserves static prefixes/suffixes around the interpolation slot.
 */
function composeVarReference(parts: CssValuePart[], varName: string): string {
  if (
    parts.length === 2 &&
    parts[0]?.kind === "slot" &&
    parts[1]?.kind === "static" &&
    isCssUnitSuffix(parts[1].value)
  ) {
    return `calc(var(${varName}) * 1${parts[1].value.trim()})`;
  }
  if (
    parts.length === 3 &&
    parts[0]?.kind === "static" &&
    parts[0].value.trim() === "-" &&
    parts[1]?.kind === "slot" &&
    parts[2]?.kind === "static" &&
    isCssUnitSuffix(parts[2].value)
  ) {
    return `calc(-1 * var(${varName}) * 1${parts[2].value.trim()})`;
  }
  return parts.map((p) => (p.kind === "static" ? p.value : `var(${varName})`)).join("");
}

function isCssUnitSuffix(value: string): boolean {
  return /^(?:px|r?em|%|vh|vw|vmin|vmax|cqw|cqh|cqi|cqb|cqmin|cqmax|ch|ex|lh|rlh|svh|lvh|dvh|svw|lvw|dvw)$/.test(
    value.trim(),
  );
}

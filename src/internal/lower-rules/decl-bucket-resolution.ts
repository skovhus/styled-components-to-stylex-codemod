/**
 * Declaration/slot resolution helpers for relation override buckets.
 *
 * Processes CSS declarations into flat style buckets, resolving static values
 * and interpolation slots (theme values, adapter calls) into AST nodes.
 */
import type { DeclProcessingState } from "./decl-setup.js";
import type { CssDeclarationIR } from "../css-ir.js";
import { cssDeclarationToStylexDeclarations } from "../css-prop-mapping.js";
import { cssValueToJs } from "../transform/helpers.js";
import { maybeApplyAuthoredMultilineToExpression } from "../utilities/css-authored-multiline.js";
import type { ExpressionKind } from "./decl-types.js";
import { maybeOmitPxUnitFromStylexValue } from "./inline-styles.js";
import { setStyleObjectValue, tryResolveAdapterCall, type AdapterCallResolver } from "./utils.js";

/**
 * Processes rule declarations into a relation override bucket, handling both static
 * and interpolated (theme-resolved) values. Returns "bail" if any interpolated
 * declaration can't be resolved; returns the set of property names written otherwise.
 */
export function processDeclarationsIntoBucket(
  rule: { declarations: CssDeclarationIR[] },
  bucket: Record<string, unknown>,
  j: DeclProcessingState["state"]["j"],
  decl: { templateExpressions: unknown[]; rawCss?: string },
  resolveThemeValue: (expr: unknown) => unknown,
  resolveThemeValueFromFn: (expr: unknown) => unknown,
  options?: {
    bailOnUnresolved?: boolean;
    callResolver?: AdapterCallResolver;
  },
): Set<string> | "bail" {
  const writtenProps = new Set<string>();
  for (const d of rule.declarations) {
    const result = writeResolvedDeclaration(
      d,
      bucket,
      j,
      decl,
      resolveThemeValue,
      resolveThemeValueFromFn,
      writtenProps,
      options?.callResolver,
    );
    if (result === "written" || result === "skip") {
      continue;
    }
    // result === "unresolved"
    if (options?.bailOnUnresolved) {
      return "bail";
    }
  }
  return writtenProps;
}

/**
 * Shared logic for processing a single declaration into a bucket.
 * Handles static values and theme-resolvable interpolations.
 * Returns "written" if handled, "skip" for non-interpolated non-static,
 * or "unresolved" if the interpolation couldn't be resolved.
 */
export function writeResolvedDeclaration(
  d: CssDeclarationIR,
  bucket: Record<string, unknown>,
  j: DeclProcessingState["state"]["j"],
  decl: { templateExpressions: unknown[]; rawCss?: string },
  resolveThemeValue: (expr: unknown) => unknown,
  resolveThemeValueFromFn: (expr: unknown) => unknown,
  writtenProps: Set<string>,
  callResolver?: AdapterCallResolver,
): "written" | "skip" | "unresolved" {
  if (d.value.kind === "static") {
    for (const out of cssDeclarationToStylexDeclarations(d)) {
      if (out.value.kind !== "static") {
        continue;
      }
      setStyleObjectValue(bucket, out.prop, cssValueToJs(out.value, d.important, out.prop));
      writtenProps.add(out.prop);
    }
    return "written";
  }

  if (d.value.kind !== "interpolated" || !d.property) {
    return "skip";
  }

  const resolveResult = resolveAllSlots(
    d,
    decl,
    resolveThemeValue,
    resolveThemeValueFromFn,
    callResolver,
  );
  if (!resolveResult || resolveResult === "bail") {
    return "unresolved";
  }

  for (const out of cssDeclarationToStylexDeclarations(d)) {
    if (out.value.kind === "static") {
      setStyleObjectValue(bucket, out.prop, cssValueToJs(out.value, d.important, out.prop));
    } else {
      const built = buildInterpolatedValue(j, { value: out.value }, resolveResult);
      const formatted = maybeApplyAuthoredMultilineToExpression(j, built, {
        rawCss: decl.rawCss,
        property: (d.property ?? "").trim(),
        stylisValueRaw: d.valueRaw ?? "",
      }) as ExpressionKind;
      setStyleObjectValue(
        bucket,
        out.prop,
        maybeOmitPxUnitFromStylexValue(j, formatted, out.prop, d.important),
      );
    }
    writtenProps.add(out.prop);
  }
  return "written";
}

/**
 * Resolves all interpolation slots in a declaration to theme AST nodes.
 * Returns a resolver function `(slotId) => astNode`, or `"bail"` if any
 * slot can't be resolved, or `null` if no slots are found.
 *
 * When `callResolver` is provided, imported function calls like `colorCSS("labelMuted")`
 * are resolved via the adapter's `resolveCall` before falling back to theme resolution.
 */
function resolveAllSlots(
  d: {
    value: { kind: string; parts?: Array<{ kind: string; slotId?: number }> };
    property?: string;
  },
  decl: { templateExpressions: unknown[]; rawCss?: string },
  resolveThemeValue: (expr: unknown) => unknown,
  resolveThemeValueFromFn: (expr: unknown) => unknown,
  callResolver?: AdapterCallResolver,
): ((slotId: number) => unknown) | "bail" | null {
  const parts = (d.value as { parts?: Array<{ kind: string; slotId?: number }> }).parts;
  if (!parts) {
    return null;
  }
  const slotParts = parts.filter((p) => p.kind === "slot" && p.slotId !== undefined);
  if (slotParts.length === 0) {
    return null;
  }
  const resolvedBySlotId = new Map<number, unknown>();
  for (const sp of slotParts) {
    const slotId = sp.slotId;
    if (slotId === undefined || resolvedBySlotId.has(slotId)) {
      continue;
    }
    const expr = decl.templateExpressions[slotId] as unknown;
    let resolved: unknown = null;

    if (
      expr &&
      typeof expr === "object" &&
      ((expr as { type?: string }).type === "ArrowFunctionExpression" ||
        (expr as { type?: string }).type === "FunctionExpression")
    ) {
      resolved = resolveThemeValueFromFn(expr);
    } else if (
      callResolver &&
      expr &&
      typeof expr === "object" &&
      (expr as { type?: string }).type === "CallExpression"
    ) {
      // Try resolving imported function calls (e.g., colorCSS("labelMuted"), transitionSpeed("fast"))
      const callResult = tryResolveAdapterCall(expr, d.property, callResolver);
      resolved = callResult?.ast ?? resolveThemeValue(expr);
    } else {
      resolved = resolveThemeValue(expr);
    }

    if (!resolved) {
      return "bail";
    }
    resolvedBySlotId.set(slotId, resolved);
  }
  return (slotId: number) => resolvedBySlotId.get(slotId);
}

/**
 * Builds the final AST value for an interpolated CSS declaration,
 * preserving the order of static and interpolated parts.
 *
 * Each slot is resolved independently via `resolveSlot(slotId)`.
 *
 * For a declaration like `border: 2px solid ${color}`, this produces
 * a template literal `\`2px solid ${resolvedExpr}\``.
 * For a purely interpolated value like `${color}`, returns the resolved
 * expression directly.
 */
function buildInterpolatedValue(
  j: DeclProcessingState["state"]["j"],
  d: {
    value: {
      kind: string;
      parts?: Array<{ kind: string; value?: string; slotId?: number }>;
    };
  },
  resolveSlot: (slotId: number) => unknown,
): unknown {
  const parts = d.value.parts ?? [];
  const hasStaticParts = parts.some((p) => p.kind === "static" && p.value);
  if (hasStaticParts) {
    const quasis: any[] = [];
    const expressions: any[] = [];
    let currentStatic = "";

    for (const part of parts) {
      if (part.kind === "static") {
        currentStatic += part.value ?? "";
      } else if (part.kind === "slot" && part.slotId !== undefined) {
        quasis.push(j.templateElement({ raw: currentStatic, cooked: currentStatic }, false));
        currentStatic = "";
        expressions.push(resolveSlot(part.slotId));
      }
    }
    quasis.push(j.templateElement({ raw: currentStatic, cooked: currentStatic }, true));
    return j.templateLiteral(quasis, expressions);
  }
  // Single-slot pure interpolation: return the resolved value directly
  const singleSlot = parts.find((p) => p.kind === "slot" && p.slotId !== undefined);
  if (singleSlot && singleSlot.slotId !== undefined) {
    return resolveSlot(singleSlot.slotId);
  }
  return j.literal(null);
}

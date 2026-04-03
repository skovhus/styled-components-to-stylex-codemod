/**
 * Resolves helper function calls from a declarative CallMapping configuration.
 */
import type {
  CallMapping,
  CallMappingResolveEntry,
  CallMappingValue,
  CallResolveContext,
  CallResolveResult,
} from "../adapter.js";
import { MAPPING_NO_MATCH } from "./mapping-utils.js";

/* ── Exports ─────────────────────────────────────────────────────────── */

export { MAPPING_NO_MATCH as CALL_MAPPING_NO_MATCH };

type CallMappingResult = CallResolveResult | typeof MAPPING_NO_MATCH;

/**
 * Resolve a helper call against a declarative CallMapping.
 *
 * Returns:
 * - A `CallResolveResult` on match
 * - `MAPPING_NO_MATCH` when no entry matched (caller should fall through to resolveCall)
 */
export function resolveCallFromMapping(
  mapping: CallMapping,
  ctx: CallResolveContext,
): CallMappingResult {
  const callKey = buildCallKey(ctx);

  for (const [pattern, entry] of mapping) {
    if (!matchCallPattern(pattern, callKey, ctx.calleeImportedName)) {
      continue;
    }

    return buildCallResult(entry, ctx);
  }

  return MAPPING_NO_MATCH;
}

/* ── Helpers ─────────────────────────────────────────────────────────── */

/** Build the full call key from context (e.g. "ColorConverter.cssWithAlpha"). */
function buildCallKey(ctx: CallResolveContext): string {
  if (ctx.calleeMemberPath && ctx.calleeMemberPath.length > 0) {
    return `${ctx.calleeImportedName}.${ctx.calleeMemberPath.join(".")}`;
  }
  return ctx.calleeImportedName;
}

/** Match a pattern against the call key or just the function name. */
function matchCallPattern(pattern: string, callKey: string, importedName: string): boolean {
  return pattern === callKey || pattern === importedName;
}

/** Extract the first literal string argument from the call context. */
function getFirstLiteralArg(ctx: CallResolveContext): string | undefined {
  const arg0 = ctx.args[0];
  if (arg0?.kind === "literal" && typeof arg0.value === "string") {
    return arg0.value;
  }
  return undefined;
}

/** Interpolate `{arg0}` placeholder in an expression. */
function interpolateCallExpr(template: string, ctx: CallResolveContext): string {
  if (!template.includes("{arg0}")) {
    return template;
  }
  const arg0 = getFirstLiteralArg(ctx);
  // If the template has {arg0} but there's no literal arg, return template as-is
  // (the caller will use it for dynamic arg patterns)
  if (arg0 === undefined) {
    return template.replace(/\.\{arg0\}$/, "");
  }
  return template.replace(/\{arg0\}/g, arg0);
}

/** Build a CallResolveResult from a mapping entry. */
function buildCallResult(entry: CallMappingValue, ctx: CallResolveContext): CallResolveResult {
  // Runtime-only entry
  if ("preserveRuntimeCall" in entry && !("expr" in entry)) {
    return { preserveRuntimeCall: true };
  }

  // Extra classNames entry
  if ("extraClassNames" in entry && !("expr" in entry)) {
    return { extraClassNames: entry.extraClassNames };
  }

  // At this point we know it has `expr` since runtime-only and classNames-only are handled above
  const resolveEntry = entry as CallMappingResolveEntry;
  const expr = interpolateCallExpr(resolveEntry.expr, ctx);

  return {
    expr,
    imports: resolveEntry.imports,
    ...(resolveEntry.usage ? { usage: resolveEntry.usage } : {}),
    ...(resolveEntry.dynamicArgUsage ? { dynamicArgUsage: resolveEntry.dynamicArgUsage } : {}),
    ...(resolveEntry.cssText ? { cssText: resolveEntry.cssText } : {}),
    ...(resolveEntry.preserveRuntimeCall ? { preserveRuntimeCall: true } : {}),
    ...(resolveEntry.extraClassNames ? { extraClassNames: resolveEntry.extraClassNames } : {}),
  };
}

/**
 * Wraps adapter resolution hooks with safety checks and warnings.
 * Core concepts: guarded adapter calls and bail signaling.
 */
import {
  type Adapter,
  type CallResolveContext,
  type CallResolveResult,
  type ImportSource,
  isDirectionalResult,
  type ResolveValueContext,
  type ResolveValueDirectionalResult,
  type ResolveValueResult,
  type SelectorResolveContext,
  type SelectorResolveResult,
} from "../adapter.js";
import type { WarningLog } from "./logger.js";
import { resolveCallFromMapping, CALL_MAPPING_NO_MATCH } from "./call-mapping-resolver.js";
import {
  resolveCssVariableFromMapping,
  CSS_VARIABLE_MAPPING_NO_MATCH,
} from "./css-variable-mapping-resolver.js";
import {
  resolveSelectorFromMapping,
  SELECTOR_MAPPING_NO_MATCH,
} from "./selector-mapping-resolver.js";
import { resolveThemeFromMapping, THEME_MAPPING_NO_MATCH } from "./theme-mapping-resolver.js";

export function createResolveAdapterSafe(args: { adapter: Adapter; warnings: WarningLog[] }): {
  resolveValueSafe: (ctx: ResolveValueContext) => ResolveValueResult | undefined;
  /**
   * Like `resolveValueSafe`, but also returns directional results.
   * Only used by theme resolvers that know how to handle directional expansions.
   */
  resolveValueDirectionalSafe: (
    ctx: ResolveValueContext,
  ) => ResolveValueResult | ResolveValueDirectionalResult | undefined;
  resolveCallSafe: (ctx: CallResolveContext) => CallResolveResult | undefined;
  resolveSelectorSafe: (ctx: SelectorResolveContext) => SelectorResolveResult | undefined;
  bailRef: { value: boolean };
} {
  const { adapter } = args;
  const bailRef = { value: false };

  /**
   * Core adapter call with bail handling. Returns the full union type
   * including directional results.
   */
  const resolveValueCore = (
    ctx: ResolveValueContext,
  ): ResolveValueResult | ResolveValueDirectionalResult | undefined => {
    if (bailRef.value) {
      return undefined;
    }
    if (ctx.kind === "importedValue" && isStylexFileSource(ctx.source)) {
      return stylexImportPassthrough(ctx.importedName, ctx.source, ctx.path);
    }

    // Declarative theme mapping: try static mapping before calling resolveValue
    if (ctx.kind === "theme" && adapter.themeMapping) {
      const mapped = resolveThemeFromMapping(adapter.themeMapping, ctx);
      if (mapped !== THEME_MAPPING_NO_MATCH) {
        // mapped is either a result or undefined (bail)
        if (mapped === undefined) {
          bailRef.value = true;
        }
        return mapped;
      }
      // No match — fall through to resolveValue
    }

    // Declarative CSS variable mapping: try static mapping before calling resolveValue
    if (ctx.kind === "cssVariable" && adapter.cssVariableMapping) {
      const mapped = resolveCssVariableFromMapping(adapter.cssVariableMapping, ctx);
      if (mapped !== CSS_VARIABLE_MAPPING_NO_MATCH) {
        return mapped;
      }
    }

    const res = adapter.resolveValue(ctx);
    // `undefined` means bail/skip the file, except for cssVariable where it means "keep as-is"
    if (res === undefined && ctx.kind !== "cssVariable") {
      bailRef.value = true;
      return undefined;
    }
    return res;
  };

  const resolveValueSafe = (ctx: ResolveValueContext): ResolveValueResult | undefined => {
    const res = resolveValueCore(ctx);
    // Directional results are only handled by theme resolvers via resolveValueDirectionalSafe.
    // For all other call sites, treat as "not resolved" without bailing.
    if (res && isDirectionalResult(res)) {
      return undefined;
    }
    return res;
  };

  const resolveValueDirectionalSafe = (
    ctx: ResolveValueContext,
  ): ResolveValueResult | ResolveValueDirectionalResult | undefined => {
    return resolveValueCore(ctx);
  };

  const resolveCallSafe = (ctx: CallResolveContext): CallResolveResult | undefined => {
    if (bailRef.value) {
      return undefined;
    }
    if (isStylexFileSource(ctx.calleeSource)) {
      return stylexImportPassthrough(
        ctx.calleeImportedName,
        ctx.calleeSource,
        ctx.calleeMemberPath?.join("."),
      );
    }
    // Declarative call mapping: try static mapping before calling resolveCall
    if (adapter.callMapping) {
      const mapped = resolveCallFromMapping(adapter.callMapping, ctx);
      if (mapped !== CALL_MAPPING_NO_MATCH) {
        return mapped;
      }
    }

    const res = adapter.resolveCall(ctx);
    // `undefined` means bail/skip the file
    if (res === undefined) {
      bailRef.value = true;
      return undefined;
    }
    return res;
  };

  const resolveSelectorSafe = (ctx: SelectorResolveContext): SelectorResolveResult | undefined => {
    if (isStylexFileSource(ctx.source)) {
      return {
        kind: "media",
        ...stylexImportPassthrough(ctx.importedName, ctx.source, ctx.path),
      };
    }
    // Declarative selector mapping: try static mapping before calling resolveSelector
    if (adapter.selectorMapping) {
      const mapped = resolveSelectorFromMapping(adapter.selectorMapping, ctx);
      if (mapped !== SELECTOR_MAPPING_NO_MATCH) {
        return mapped;
      }
    }

    // Note: resolveSelector returning undefined does NOT bail the entire file.
    // It just means this specific selector interpolation couldn't be resolved,
    // and the calling code will handle the bail for that component.
    return adapter.resolveSelector(ctx);
  };

  return {
    resolveValueSafe,
    resolveValueDirectionalSafe,
    resolveCallSafe,
    resolveSelectorSafe,
    bailRef,
  };
}

// ────────────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────────────

const STYLEX_FILE_RE = /\.stylex(\.\w+)?$/;

/** Imports from `.stylex` files are already StyleX-compatible and need no adapter resolution. */
function isStylexFileSource(source: ImportSource): boolean {
  return STYLEX_FILE_RE.test(source.value);
}

/** Build a passthrough result that preserves the original import reference from a `.stylex` file. */
function stylexImportPassthrough(
  importedName: string,
  source: ImportSource,
  path?: string,
): ResolveValueResult {
  return {
    expr: path ? `${importedName}.${path}` : importedName,
    imports: [{ from: source, names: [{ imported: importedName }] }],
  };
}

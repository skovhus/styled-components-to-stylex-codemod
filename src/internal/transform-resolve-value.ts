/**
 * Wraps adapter resolution hooks with safety checks and warnings.
 * Core concepts: guarded adapter calls and bail signaling.
 */
import type {
  Adapter,
  CallResolveContext,
  CallResolveResult,
  ImportSource,
  ResolveValueContext,
  ResolveValueResult,
  SelectorResolveContext,
  SelectorResolveResult,
} from "../adapter.js";
import type { WarningLog } from "./logger.js";

export function createResolveAdapterSafe(args: { adapter: Adapter; warnings: WarningLog[] }): {
  resolveValueSafe: (ctx: ResolveValueContext) => ResolveValueResult | undefined;
  resolveCallSafe: (ctx: CallResolveContext) => CallResolveResult | undefined;
  resolveSelectorSafe: (ctx: SelectorResolveContext) => SelectorResolveResult | undefined;
  bailRef: { value: boolean };
} {
  const { adapter } = args;
  const bailRef = { value: false };

  const resolveValueSafe = (ctx: ResolveValueContext): ResolveValueResult | undefined => {
    if (bailRef.value) {
      return undefined;
    }
    if (ctx.kind === "importedValue" && isStylexFileSource(ctx.source)) {
      return stylexImportPassthrough(ctx.importedName, ctx.source, ctx.path);
    }
    const res = adapter.resolveValue(ctx);
    // `undefined` means bail/skip the file, except for cssVariable where it means "keep as-is"
    if (res === undefined && ctx.kind !== "cssVariable") {
      bailRef.value = true;
      return undefined;
    }
    return res;
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
    // Note: resolveSelector returning undefined does NOT bail the entire file.
    // It just means this specific selector interpolation couldn't be resolved,
    // and the calling code will handle the bail for that component.
    return adapter.resolveSelector(ctx);
  };

  return { resolveValueSafe, resolveCallSafe, resolveSelectorSafe, bailRef };
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

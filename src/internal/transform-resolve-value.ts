/**
 * Wraps adapter resolution hooks with safety checks and warnings.
 * Core concepts: guarded adapter calls and bail signaling.
 */
import type {
  Adapter,
  CallResolveContext,
  CallResolveResult,
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
    const res = adapter.resolveCall(ctx);
    // `undefined` means bail/skip the file
    if (res === undefined) {
      bailRef.value = true;
      return undefined;
    }
    return res;
  };

  const resolveSelectorSafe = (ctx: SelectorResolveContext): SelectorResolveResult | undefined => {
    // Note: resolveSelector returning undefined does NOT bail the entire file.
    // It just means this specific selector interpolation couldn't be resolved,
    // and the calling code will handle the bail for that component.
    return adapter.resolveSelector(ctx);
  };

  return { resolveValueSafe, resolveCallSafe, resolveSelectorSafe, bailRef };
}

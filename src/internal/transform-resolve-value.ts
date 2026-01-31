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
  const { adapter, warnings } = args;
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
    if (res && typeof res === "object") {
      const usage = res.usage;
      if (usage !== "create" && usage !== "props") {
        bailRef.value = true;
        warnings.push({
          severity: "error",
          type: "Adapter.resolveCall must return { usage: 'props' | 'create', expr, imports }",
          loc: undefined,
          context: ctx,
        });
        return undefined;
      }
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

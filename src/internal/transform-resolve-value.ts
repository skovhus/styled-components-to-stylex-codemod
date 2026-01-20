import type {
  Adapter,
  CallResolveContext,
  CallResolveResult,
  ResolveValueContext,
  ResolveValueResult,
} from "../adapter.js";
import type { WarningLog } from "./logger.js";

export function createResolveAdapterSafe(args: { adapter: Adapter; warnings: WarningLog[] }): {
  resolveValueSafe: (ctx: ResolveValueContext) => ResolveValueResult | null;
  resolveCallSafe: (ctx: CallResolveContext) => CallResolveResult | null;
  bailRef: { value: boolean };
} {
  const { adapter, warnings } = args;
  const bailRef = { value: false };

  const resolveValueSafe = (ctx: ResolveValueContext): ResolveValueResult | null => {
    if (bailRef.value) {
      return null;
    }
    const res = adapter.resolveValue(ctx);
    if (typeof res === "undefined") {
      bailRef.value = true;
      warnings.push({
        severity: "error",
        type: "dynamic-node",
        message: [
          "Adapter.resolveValue returned undefined. This usually means your adapter forgot to return a value.",
          "Return null to leave a value unresolved, or return { expr, imports } to resolve it.",
          "Skipping transformation for this file to avoid producing incorrect output.",
        ].join(" "),
        context: ctx,
      });
      return null;
    }
    return res;
  };

  const resolveCallSafe = (ctx: CallResolveContext): CallResolveResult | null => {
    if (bailRef.value) {
      return null;
    }
    const res = adapter.resolveCall(ctx);
    if (res === null || typeof res === "undefined") {
      bailRef.value = true;
      warnings.push({
        severity: "error",
        type: "dynamic-node",
        message: [
          "Adapter.resolveCall returned null or undefined.",
          'Return { kind: "value" | "styles", expr, imports } to resolve it.',
          "Skipping transformation for this file to avoid producing incorrect output.",
        ].join(" "),
        context: ctx,
      });
      return null;
    }
    if (res && typeof res === "object") {
      const k = (res as Partial<CallResolveResult>).kind;
      if (k !== "value" && k !== "styles") {
        bailRef.value = true;
        warnings.push({
          severity: "error",
          type: "dynamic-node",
          message: [
            'Adapter.resolveCall must return { kind: "value" | "styles", expr, imports }.',
            "Skipping transformation for this file to avoid producing incorrect output.",
          ].join(" "),
          context: ctx,
        });
        return null;
      }
    }
    return res;
  };

  return { resolveValueSafe, resolveCallSafe, bailRef };
}

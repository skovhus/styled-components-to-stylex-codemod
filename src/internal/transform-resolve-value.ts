import type { Adapter } from "../adapter.js";
import type { WarningLog } from "./logger.js";

export function createResolveValueSafe(args: { adapter: Adapter; warnings: WarningLog[] }): {
  resolveValueSafe: Adapter["resolveValue"];
  bailRef: { value: boolean };
} {
  const { adapter, warnings } = args;
  const bailRef = { value: false };

  // Runtime guard: adapter.resolveValue is typed to never return `undefined`,
  // but user adapters can accidentally fall through without a return. When that happens,
  // we skip transforming the file to avoid producing incorrect output.
  const resolveValueSafe: Adapter["resolveValue"] = (ctx) => {
    if (bailRef.value) {
      return null;
    }
    const res = (adapter.resolveValue as any)(ctx);
    if (typeof res === "undefined") {
      bailRef.value = true;
      // Emit a single warning with enough context for users to fix their adapter.
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
    return res as any;
  };

  return { resolveValueSafe, bailRef };
}

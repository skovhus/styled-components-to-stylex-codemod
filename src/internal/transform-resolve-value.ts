import type { Adapter } from "../adapter.js";
import type { TransformWarning } from "./transform-types.js";

export function createResolveValueSafe(args: { adapter: Adapter; warnings: TransformWarning[] }): {
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
        type: "dynamic-node",
        feature: "adapter-resolveValue",
        message: [
          "Adapter.resolveValue returned undefined. This usually means your adapter forgot to return a value.",
          "Return null to leave a value unresolved, or return { expr, imports } to resolve it.",
          `Skipping transformation for this file to avoid producing incorrect output.`,
          `resolveValue was called with: ${formatResolveValueContext(ctx)}`,
        ].join(" "),
      });
      return null;
    }
    return res as any;
  };

  return { resolveValueSafe, bailRef };
}

function formatResolveValueContext(ctx: unknown): string {
  const c: any = ctx as any;
  const kind = c?.kind;
  if (kind === "theme") {
    return `kind=theme path=${JSON.stringify(String(c?.path ?? ""))}`;
  }
  if (kind === "cssVariable") {
    const parts: string[] = [`kind=cssVariable name=${JSON.stringify(String(c?.name ?? ""))}`];
    if (typeof c?.fallback === "string") {
      parts.push(`fallback=${JSON.stringify(c.fallback)}`);
    }
    if (typeof c?.definedValue === "string") {
      parts.push(`definedValue=${JSON.stringify(c.definedValue)}`);
    }
    return parts.join(" ");
  }
  if (kind === "call") {
    const args = Array.isArray(c?.args) ? c.args : [];
    return [
      "kind=call",
      `calleeImportedName=${JSON.stringify(String(c?.calleeImportedName ?? ""))}`,
      `calleeSource=${JSON.stringify(c?.calleeSource ?? null)}`,
      `callSiteFilePath=${JSON.stringify(String(c?.callSiteFilePath ?? ""))}`,
      `args=${JSON.stringify(args)}`,
    ].join(" ");
  }
  try {
    return `ctx=${JSON.stringify(ctx)}`;
  } catch {
    return `ctx=${String(ctx)}`;
  }
}

/**
 * Step: resolve and inline base components via adapter.resolveBaseComponent().
 * Core concepts: adapter-driven component resolution, style inlining, and prop consumption.
 */
import type { ResolveBaseComponentResult } from "../../adapter.js";
import type { CssRuleIR } from "../css-ir.js";
import { TransformContext } from "../transform-context.js";
import { CONTINUE, type StepResult, type StyledDecl } from "../transform-types.js";

export { resolveBaseComponentsStep, sxToCssRules };

/**
 * Resolves base components (`styled(Flex)`) via the adapter and inlines their styles.
 *
 * For each `styled(Component)` declaration:
 * 1. Looks up the component in the import map
 * 2. Calls `adapter.resolveBaseComponent()` with static attrs
 * 3. If resolved: converts to intrinsic, prepends CSS rules, marks consumed props
 */
function resolveBaseComponentsStep(ctx: TransformContext): StepResult {
  const styledDecls = ctx.styledDecls as StyledDecl[] | undefined;
  const resolveBaseComponent = ctx.adapter.resolveBaseComponent;
  if (!styledDecls || !resolveBaseComponent || !ctx.importMap) {
    return CONTINUE;
  }

  for (const decl of styledDecls) {
    if (decl.base.kind !== "component") {
      continue;
    }

    const importInfo = ctx.importMap.get(decl.base.ident);
    if (!importInfo) {
      continue;
    }

    const staticProps = extractStaticPropsFromAttrs(decl);
    if (staticProps === null) {
      continue;
    }

    const importSource =
      importInfo.source.kind === "specifier" ? importInfo.source.value : importInfo.source.value;

    const result = resolveBaseComponent({
      importSource,
      importedName: importInfo.importedName,
      staticProps,
    });

    if (!result) {
      continue;
    }

    applyResolution(decl, result, ctx);
  }

  return CONTINUE;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Extract static props from `.attrs({...})`. Returns null if attrs are a function
 * (dynamic) or contain non-literal values for any prop — bail conditions.
 */
function extractStaticPropsFromAttrs(
  decl: StyledDecl,
): Record<string, string | number | boolean> | null {
  const attrs = decl.attrsInfo;
  if (!attrs) {
    return {};
  }

  const result: Record<string, string | number | boolean> = {};
  for (const [key, value] of Object.entries(attrs.staticAttrs)) {
    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
      result[key] = value;
    }
    // Skip undefined/null values — they're not consumed by the resolver
  }

  return result;
}

/**
 * Apply the resolver result to a StyledDecl:
 * - Change base to intrinsic
 * - Prepend sx declarations as CSS rules (before template CSS, so template wins)
 * - Store mixin references as extraStylexPropsArgs
 * - Remove consumed props from staticAttrs
 * - Add consumed props to shouldForwardProp.dropProps
 * - Store result for downstream steps
 */
function applyResolution(
  decl: StyledDecl,
  result: ResolveBaseComponentResult,
  ctx: TransformContext,
): void {
  decl.base = { kind: "intrinsic", tagName: result.tagName };

  if (result.sx) {
    const sxRules = sxToCssRules(result.sx);
    decl.rules = [...sxRules, ...decl.rules];
  }

  if (result.mixins && result.mixins.length > 0) {
    const mixinArgs = result.mixins.map((mixin) => {
      const expr = ctx.parseExpr(`${mixin.importName}.${mixin.styleKey}`);

      ctx.resolverImports.set(
        JSON.stringify({ source: mixin.importSource, name: mixin.importName }),
        {
          from: { kind: "specifier", value: mixin.importSource },
          names: [{ imported: mixin.importName }],
        },
      );

      return { expr, afterBase: false };
    });

    decl.extraStylexPropsArgs = [...mixinArgs, ...(decl.extraStylexPropsArgs ?? [])];
  }

  removeConsumedPropsFromAttrs(decl, result.consumedProps);
  addConsumedPropsToDropList(decl, result.consumedProps);

  decl.inlinedBaseComponent = result;
}

/**
 * Convert a flat `sx` record (camelCase CSS prop → value) to CssRuleIR entries.
 * These go into the root `&` selector with no at-rule stack.
 */
function sxToCssRules(sx: Record<string, string>): CssRuleIR[] {
  const declarations = Object.entries(sx).map(([prop, value]) => ({
    property: camelToKebab(prop),
    value: { kind: "static" as const, value },
    important: false,
    valueRaw: value,
  }));

  if (declarations.length === 0) {
    return [];
  }

  return [{ selector: "&", atRuleStack: [], declarations }];
}

function camelToKebab(str: string): string {
  return str.replace(/[A-Z]/g, (char) => `-${char.toLowerCase()}`);
}

/**
 * Remove consumed props from the static attrs so they aren't forwarded to the DOM.
 */
function removeConsumedPropsFromAttrs(decl: StyledDecl, consumedProps: string[]): void {
  if (!decl.attrsInfo) {
    return;
  }
  const consumed = new Set(consumedProps);
  const remaining: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(decl.attrsInfo.staticAttrs)) {
    if (!consumed.has(key)) {
      remaining[key] = value;
    }
  }
  decl.attrsInfo.staticAttrs = remaining;
}

/**
 * Add consumed props to shouldForwardProp.dropProps so they're stripped from JSX
 * and destructured out of `{...rest}` in wrappers.
 */
function addConsumedPropsToDropList(decl: StyledDecl, consumedProps: string[]): void {
  if (consumedProps.length === 0) {
    return;
  }
  const existing = decl.shouldForwardProp?.dropProps ?? [];
  const existingSet = new Set(existing);
  const newProps = consumedProps.filter((p) => !existingSet.has(p));
  if (newProps.length === 0) {
    return;
  }
  decl.shouldForwardProp = {
    ...decl.shouldForwardProp,
    dropProps: [...existing, ...newProps],
  };
}

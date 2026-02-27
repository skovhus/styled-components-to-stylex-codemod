/**
 * Resolves base components via adapter.resolveBaseComponent for inlining.
 * Converts adapter sx/mixins into StyledDecl fields (rules, extraStylexPropsArgs, etc.).
 */
import type { CssDeclarationIR, CssRuleIR } from "./css-ir.js";
import type { StyledDecl } from "./transform-types.js";
import type {
  ImportSource,
  ResolveBaseComponentContext,
  ResolveBaseComponentResult,
} from "../adapter.js";
import type { JSCodeshift } from "jscodeshift";

/**
 * Converts adapter sx (Record<string, string>) to CssRuleIR for prepending to decl.rules.
 */
function sxToCssRules(sx: Record<string, string>): CssRuleIR[] {
  if (Object.keys(sx).length === 0) {
    return [];
  }
  const declarations: CssDeclarationIR[] = Object.entries(sx).map(([prop, value]) => ({
    property: prop,
    value: { kind: "static" as const, value },
    important: false,
    valueRaw: value,
  }));
  return [{ selector: "&", atRuleStack: [], declarations }];
}

/**
 * Resolves importSource to a string for the adapter (specifier or path).
 */
function importSourceToString(source: ImportSource): string {
  return source.value;
}

/**
 * Builds staticProps from attrsInfo.staticAttrs, keeping only string/number/boolean.
 */
function buildStaticProps(
  staticAttrs: Record<string, unknown>,
): Record<string, string | number | boolean> {
  const out: Record<string, string | number | boolean> = {};
  for (const [k, v] of Object.entries(staticAttrs)) {
    if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") {
      out[k] = v;
    }
  }
  return out;
}

export function resolveBaseComponents(args: {
  styledDecls: StyledDecl[];
  importMap: Map<string, { importedName: string; source: ImportSource }>;
  resolveBaseComponent: (
    ctx: ResolveBaseComponentContext,
  ) => ResolveBaseComponentResult | undefined;
  j: JSCodeshift;
  addMixinImport: (imp: {
    from: ImportSource;
    names: Array<{ imported: string; local?: string }>;
  }) => void;
}): void {
  const { styledDecls, importMap, resolveBaseComponent, j, addMixinImport } = args;

  for (const decl of styledDecls) {
    if (decl.base.kind !== "component") {
      continue;
    }

    const ident = decl.base.ident;
    const importEntry = importMap.get(ident);
    if (!importEntry) {
      continue;
    }

    // Bail: attrs is a function
    const attrsArgIsFunction = decl.attrsInfo?.attrsArgIsFunction;
    if (attrsArgIsFunction) {
      continue;
    }

    const staticProps = buildStaticProps(decl.attrsInfo?.staticAttrs ?? {});

    // Include attrsAsTag as "as" for the resolver (e.g. Flex with as="section")
    if (decl.attrsInfo?.attrsAsTag && typeof decl.attrsInfo.attrsAsTag === "string") {
      staticProps.as = decl.attrsInfo.attrsAsTag;
    }

    const importSourceStr = importSourceToString(importEntry.source);
    const result = resolveBaseComponent({
      importSource: importSourceStr,
      importedName: importEntry.importedName,
      staticProps,
    });

    if (!result) {
      continue;
    }

    if (!result.sx && (!result.mixins || result.mixins.length === 0)) {
      continue;
    }

    // Change base to intrinsic
    (decl as { base: StyledDecl["base"] }).base = {
      kind: "intrinsic",
      tagName: result.tagName,
    };

    // Store original ident for downstream (e.g. collectStaticPropsStep, import cleanup)
    (decl as { originalBaseIdent?: string }).originalBaseIdent = ident;

    // Prepend sx to rules (adapter CSS before template CSS, so template wins on conflicts)
    if (result.sx && Object.keys(result.sx).length > 0) {
      const adapterRules = sxToCssRules(result.sx);
      decl.rules = [...adapterRules, ...decl.rules];
    }

    // Add mixins to extraStylexPropsArgs (before component styles)
    if (result.mixins && result.mixins.length > 0) {
      decl.extraStylexPropsArgs ??= [];
      for (const mixin of result.mixins) {
        addMixinImport({
          from: { kind: "specifier" as const, value: mixin.importSource },
          names: [{ imported: mixin.importName }],
        });
        const expr = j.memberExpression(
          j.identifier(mixin.importName),
          j.identifier(mixin.styleKey),
        );
        decl.extraStylexPropsArgs.unshift({ expr });
      }
    }

    // Merge consumed props into shouldForwardProp.dropProps
    const existingDrop = decl.shouldForwardProp?.dropProps ?? [];
    const combinedDrop = [...new Set([...result.consumedProps, ...existingDrop])];
    decl.shouldForwardProp = {
      ...decl.shouldForwardProp,
      dropProps: combinedDrop,
    };

    // Remove consumed props from staticAttrs (they've been converted to styles)
    if (decl.attrsInfo?.staticAttrs) {
      for (const prop of result.consumedProps) {
        delete decl.attrsInfo.staticAttrs[prop];
      }
    }

    // Store for downstream (per-site resolution, etc.)
    decl.inlinedBaseComponent = {
      tagName: result.tagName,
      consumedProps: result.consumedProps,
      baseSx: result.sx,
      baseMixins: result.mixins,
    };
  }
}

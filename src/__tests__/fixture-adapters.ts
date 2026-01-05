import { defineAdapter } from "../adapter.js";

// Test adapters - examples of custom adapter usage
export const customAdapter = defineAdapter({
  resolveValue(ctx) {
    if (ctx.kind !== "theme") return null;
    return {
      expr: `customVar('${ctx.path}', '')`,
      imports: ["import { customVar } from './custom-theme';"],
    };
  },
});

// Fixtures don't use theme resolution, but the transformer requires an adapter.
export const fixtureAdapter = defineAdapter({
  resolveValue(ctx) {
    if (ctx.kind === "theme") {
      return { expr: `tokens.${ctx.path.replace(/\./g, "_")}`, imports: [] };
    }

    if (ctx.kind !== "cssVariable") return null;

    const { name, definedValue } = ctx;

    // css-calc fixture: lift `var(--base-size)` to StyleX vars, and drop local definition when it matches.
    if (name === "--base-size") {
      return {
        expr: "calcVars.baseSize",
        imports: ['import { calcVars } from "./css-calc.stylex";'],
        ...(definedValue === "16px" ? { dropDefinition: true } : {}),
      };
    }

    // css-variables fixture: map known vars to `vars.*` and `textVars.*`
    const combinedImport = 'import { vars, textVars } from "./css-variables.stylex";';
    const varsMap: Record<string, string> = {
      "--color-primary": "colorPrimary",
      "--color-secondary": "colorSecondary",
      "--spacing-sm": "spacingSm",
      "--spacing-md": "spacingMd",
      "--spacing-lg": "spacingLg",
      "--border-radius": "borderRadius",
    };
    const textVarsMap: Record<string, string> = {
      "--text-color": "textColor",
      "--font-size": "fontSize",
      "--line-height": "lineHeight",
    };
    const v = varsMap[name];
    if (v) return { expr: `vars.${v}`, imports: [combinedImport] };
    const t = textVarsMap[name];
    if (t) return { expr: `textVars.${t}`, imports: [combinedImport] };
    return null;
  },
});

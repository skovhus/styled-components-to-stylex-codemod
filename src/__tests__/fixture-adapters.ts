import { createAdapter, type Adapter } from "../adapter.js";

// Test adapters - these are examples of custom adapters
export const defineVarsAdapter: Adapter = createAdapter({
  transformValue({ path }) {
    const varName = path
      .split(".")
      .map((part, i) => (i === 0 ? part : part.charAt(0).toUpperCase() + part.slice(1)))
      .join("");
    return `themeVars.${varName}`;
  },
  getImports() {
    return ["import { themeVars } from './tokens.stylex';"];
  },
  getDeclarations() {
    return [];
  },
});

export const inlineValuesAdapter: Adapter = createAdapter({
  transformValue({ defaultValue }) {
    return defaultValue ? `'${defaultValue}'` : "''";
  },
  getImports() {
    return [];
  },
  getDeclarations() {
    return [];
  },
});

/**
 * Adapter for css-variables fixture
 * Maps CSS vars like --color-primary to vars.colorPrimary
 */
export const cssVariablesAdapter: Adapter = createAdapter({
  transformValue({ path }) {
    return `'var(--${path.replace(/\./g, "-")})'`;
  },
  getImports() {
    return [];
  },
  getDeclarations() {
    return [];
  },
  resolveCssVariable(name: string, _fallback?: string) {
    // Map CSS vars to their respective modules
    // vars: color-primary, color-secondary, spacing-sm, spacing-md, spacing-lg, border-radius
    // textVars: text-color, font-size, line-height (these have fallbacks)
    const varsMapping: Record<string, string> = {
      "color-primary": "vars.colorPrimary",
      "color-secondary": "vars.colorSecondary",
      "spacing-sm": "vars.spacingSm",
      "spacing-md": "vars.spacingMd",
      "spacing-lg": "vars.spacingLg",
      "border-radius": "vars.borderRadius",
    };
    const textVarsMapping: Record<string, string> = {
      "text-color": "textVars.textColor",
      "font-size": "textVars.fontSize",
      "line-height": "textVars.lineHeight",
    };

    if (varsMapping[name]) {
      return {
        code: varsMapping[name]!,
        imports: ["import { vars, textVars } from './css-variables.stylex';"],
      };
    }
    if (textVarsMapping[name]) {
      return {
        code: textVarsMapping[name]!,
        imports: ["import { vars, textVars } from './css-variables.stylex';"],
      };
    }

    // Keep original for unknown vars
    return undefined;
  },
});

/**
 * Adapter for css-calc fixture
 * Maps CSS vars like --base-size to calcVars.baseSize
 */
export const cssCalcAdapter: Adapter = createAdapter({
  transformValue({ path }) {
    return `'var(--${path.replace(/\./g, "-")})'`;
  },
  getImports() {
    return [];
  },
  getDeclarations() {
    return [];
  },
  resolveCssVariable(name: string) {
    // Map --base-size to calcVars.baseSize
    // Note: The resolution logic will wrap in ${} when creating template literals
    if (name === "base-size") {
      return {
        code: "calcVars.baseSize",
        imports: ["import { calcVars } from './css-calc.stylex';"],
      };
    }
    return undefined;
  },
});

/**
 * Mapping of fixture names to their required adapters
 */
export const fixtureAdapters: Record<string, Adapter> = {
  "css-variables": cssVariablesAdapter,
  "css-calc": cssCalcAdapter,
};

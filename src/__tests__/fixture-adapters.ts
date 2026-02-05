/**
 * Fixture adapters used by tests and e2e runs.
 * Core concepts: adapter hooks and test-specific resolution.
 */
import {
  defineAdapter,
  type ExternalInterfaceResult,
  type ResolveValueContext,
  type ResolveValueResult,
  type SelectorResolveContext,
  type SelectorResolveResult,
} from "../adapter.ts";

// Fixtures don't use theme resolution, but the transformer requires an adapter.
export const fixtureAdapter = defineAdapter({
  // Use mergedSx merger function for cleaner className/style merging output
  // See test-cases/lib/mergedSx.ts for the implementation
  styleMerger: {
    functionName: "mergedSx",
    importSource: { kind: "specifier", value: "./lib/mergedSx" },
  },

  // Configure external interface for exported components
  externalInterface(ctx): ExternalInterfaceResult {
    // Enable external styles for exported components in specific test cases where the expected
    // output includes className/style prop support and HTMLAttributes extension.
    if (
      [
        "attrs-polymorphic-as",
        "bug-external-styles-missing-classname",
        "external-styles-support",
        "input-external-styles",
        "styled-element-html-props",
        "styled-input-html-props",
        "transient-prop-not-forwarded",
      ].some((filePath) => ctx.filePath.includes(filePath))
    ) {
      return { styles: true };
    }

    // wrapper-props-incomplete - TextColor and ThemeText should extend HTMLAttributes
    // Highlight wraps a component and shouldn't support external styles
    if (ctx.filePath.includes("wrapper-props-incomplete")) {
      if (ctx.componentName === "TextColor" || ctx.componentName === "ThemeText") {
        return { styles: true };
      }
    }

    // Enable `as` prop support (without styles) for exported components in selected fixtures.
    if (["exported-as-prop"].some((filePath) => ctx.filePath.includes(filePath))) {
      return { styles: false, as: true };
    }

    return null;
  },

  resolveValue(ctx) {
    if (ctx.kind === "theme") {
      // Test fixtures use a small ThemeProvider theme shape:
      //   props.theme.color.labelBase  -> $colors.labelBase
      //   props.theme.color[bg]        -> $colors[bg]
      //
      // `ctx.path` is the dot-path on the theme object (no bracket/index parts).
      if (ctx.path === "color") {
        return {
          expr: "$colors",
          imports: [
            {
              from: { kind: "specifier", value: "./tokens.stylex" },
              names: [{ imported: "$colors" }],
            },
          ],
        };
      }

      const lastSegment = ctx.path.split(".").pop();
      return {
        expr: `$colors.${lastSegment}`,
        imports: [
          {
            from: { kind: "specifier", value: "./tokens.stylex" },
            names: [{ imported: "$colors" }],
          },
        ],
      };
    }

    if (ctx.kind === "cssVariable") {
      const { name, definedValue } = ctx;

      // css-calc fixture: lift `var(--base-size)` to StyleX vars, and drop local definition when it matches.
      if (name === "--base-size") {
        return {
          expr: "calcVars.baseSize",
          imports: [
            {
              from: { kind: "specifier", value: "./css-calc.stylex" },
              names: [{ imported: "calcVars" }],
            },
          ],
          ...(definedValue === "16px" ? { dropDefinition: true } : {}),
        };
      }

      // css-variables fixture: map known vars to `vars.*` and `textVars.*`
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
      const fontWeightVarsMap: Record<string, string> = {
        "--font-weight-medium": "fontWeightVars.medium",
      };

      const v = varsMap[name];
      if (v) {
        return {
          expr: `vars.${v}`,
          imports: [
            {
              from: { kind: "specifier" as const, value: "./css-variables.stylex" },
              names: [{ imported: "vars" }, { imported: "textVars" }],
            },
          ],
        };
      }
      const t = textVarsMap[name];
      if (t) {
        return {
          expr: `textVars.${t}`,
          imports: [
            {
              from: { kind: "specifier" as const, value: "./css-variables.stylex" },
              names: [{ imported: "textVars" }],
            },
          ],
        };
      }
      const f = fontWeightVarsMap[name];
      if (f) {
        return {
          expr: `${f}`,
          imports: [
            {
              from: { kind: "specifier" as const, value: "./tokens.stylex" },
              names: [{ imported: "fontWeightVars" }],
            },
          ],
        };
      }
    }

    if (ctx.kind === "importedValue") {
      const source = ctx.source.value;
      if (!source.includes("lib/helpers") && !source.includes("lib\\helpers")) {
        throw new Error(`Unknown imported value: ${ctx.importedName}`);
      }
      if (ctx.importedName === "zIndex") {
        const path = ctx.path ?? "";
        return {
          expr: path ? `$zIndex.${path}` : "$zIndex",
          imports: [
            {
              from: { kind: "specifier", value: "./tokens.stylex" },
              names: [{ imported: "$zIndex" }],
            },
          ],
        };
      }
      if (ctx.importedName === "config") {
        const path = ctx.path ?? "";
        // For nested paths like "ui.spacing.small", use bracket notation with the full path
        return {
          expr: path ? `$config["${path}"]` : "$config",
          imports: [
            {
              from: { kind: "specifier", value: "./tokens.stylex" },
              names: [{ imported: "$config" }],
            },
          ],
        };
      }
      // Handle imported styled components used as mixins
      // TruncateText -> helpers.truncate (a StyleX style object)
      if (ctx.importedName === "TruncateText") {
        return {
          usage: "props",
          expr: "helpers.truncate",
          imports: [
            {
              from: { kind: "specifier", value: "./lib/helpers.stylex" },
              names: [{ imported: "helpers" }],
            },
          ],
        };
      }
    }

    // Return undefined to bail/skip the file
    return undefined;
  },
  resolveCall(ctx) {
    const src = ctx.calleeSource.value;
    // Note: calleeSource.value may or may not include the extension
    if (!src.includes("lib/helpers") && !src.includes("lib\\helpers")) {
      throw new Error(`Unknown helper: ${src} ${ctx.calleeImportedName}`);
    }

    // BUG DEMO: scrollFadeMaskStyles returns a RuleSet<object> from css`` helper,
    // but the adapter resolves it without usage: "props", so the codemod treats
    // it as a CSS value and passes the raw call into stylex.props() -> TS2345.
    if (ctx.calleeImportedName === "scrollFadeMaskStyles") {
      return {
        // Missing usage: "props" — this is the bug.
        // The expression still evaluates to RuleSet<object> at runtime.
        expr: "scrollFadeMaskStyles(18)",
        imports: [
          {
            from: { kind: "specifier", value: "./lib/helpers" },
            names: [{ imported: "scrollFadeMaskStyles" }],
          },
        ],
      };
    }

    const helperStyleKey = (() => {
      switch (ctx.calleeImportedName) {
        case "gradient":
        case "truncate":
        case "flexCenter":
          return ctx.calleeImportedName;
        default:
          return undefined;
      }
    })();
    if (helperStyleKey) {
      // These helpers return StyleX style objects (for standalone interpolations)
      // Explicitly mark as "props" so the codemod knows not to use them as CSS values
      return {
        usage: "props",
        expr: `helpers.${helperStyleKey}`,
        imports: [
          {
            from: { kind: "specifier", value: "./lib/helpers.stylex" },
            names: [{ imported: "helpers" }],
          },
        ],
      };
    }

    if (ctx.calleeImportedName === "thinPixel") {
      return {
        expr: "pixelVars.thin",
        imports: [
          {
            from: { kind: "specifier", value: "./tokens.stylex" },
            names: [{ imported: "pixelVars" }],
          },
        ],
      };
    }

    const arg0 = ctx.args[0];
    const key = arg0?.kind === "literal" && typeof arg0.value === "string" ? arg0.value : null;
    const themeColorKey = (() => {
      if (!arg0 || arg0.kind !== "theme") {
        return undefined;
      }
      // Only support theme color paths like: props.theme.color.bgSub -> "color.bgSub"
      if (!arg0.path.startsWith("color.")) {
        return undefined;
      }
      const k = arg0.path.slice("color.".length);
      return k ? k : null;
    })();

    // Handle borderByColor(theme.color.*) helper from ./lib/helpers.ts
    // borderByColor(props.theme.color.bgSub) -> `1px solid ${$colors.bgSub}`
    if (ctx.calleeImportedName === "borderByColor" && themeColorKey) {
      return {
        expr: `\`1px solid \${$colors.${themeColorKey}}\``,
        imports: [
          {
            from: { kind: "specifier", value: "./tokens.stylex" },
            names: [{ imported: "$colors" }],
          },
        ],
      };
    }

    if (!key) {
      return undefined;
    }

    // Handle color() helper from ./lib/helpers.ts
    // color("bgBase") -> $colors.bgBase
    if (ctx.calleeImportedName === "color") {
      return {
        expr: `$colors.${key}`,
        imports: [
          {
            from: { kind: "specifier", value: "./tokens.stylex" },
            names: [{ imported: "$colors" }],
          },
        ],
      };
    }

    // Handle fontWeight() helper from ./lib/helpers.ts
    // fontWeight("medium") -> fontWeightVars.medium
    if (ctx.calleeImportedName === "fontWeight") {
      return {
        expr: `fontWeightVars.${key}`,
        imports: [
          {
            from: { kind: "specifier", value: "./tokens.stylex" },
            names: [{ imported: "fontWeightVars" }],
          },
        ],
      };
    }

    // Handle fontSize() helper from ./lib/helpers.ts
    // fontSize("medium") -> fontSizeVars.medium
    if (ctx.calleeImportedName === "fontSize") {
      return {
        expr: `fontSizeVars.${key}`,
        imports: [
          {
            from: { kind: "specifier", value: "./tokens.stylex" },
            names: [{ imported: "fontSizeVars" }],
          },
        ],
      };
    }

    // Handle transitionSpeed() helper from ./lib/helpers.ts
    if (ctx.calleeImportedName === "transitionSpeed") {
      return {
        expr: `transitionSpeed.${key}`,
        imports: [
          {
            from: { kind: "specifier", value: "./tokens.stylex" },
            names: [{ imported: "transitionSpeed" }],
          },
        ],
      };
    }

    // Handle themedBorder() helper from ./lib/helpers.ts
    // Returns undefined (bails) if key is missing, e.g. themedBorder() without argument
    // Returns a CSS value expression that gets expanded to borderWidth/Style/Color properties
    if (ctx.calleeImportedName === "themedBorder" && key) {
      return {
        expr: `\`\${pixelVars.thin} solid \${$colors.${key}}\``,
        imports: [
          {
            from: { kind: "specifier", value: "./tokens.stylex" },
            names: [{ imported: "pixelVars" }, { imported: "$colors" }],
          },
        ],
      };
    }

    return undefined;
  },
  resolveSelector(ctx) {
    const source = ctx.source.value;
    if (!source.includes("lib/helpers") && !source.includes("lib\\helpers")) {
      return undefined;
    }

    // Handle screenSize.phone, screenSize.tablet, etc.
    if (ctx.importedName === "screenSize" && ctx.path) {
      return {
        kind: "media",
        expr: `breakpoints.${ctx.path}`,
        imports: [
          {
            from: { kind: "specifier", value: "./lib/breakpoints.stylex" },
            names: [{ imported: "breakpoints" }],
          },
        ],
      };
    }

    return undefined;
  },
});

function customResolveValue(ctx: ResolveValueContext): ResolveValueResult | undefined {
  if (ctx.kind !== "theme") {
    return undefined;
  }
  return {
    expr: `customVar('${ctx.path}', '')`,
    imports: [
      {
        from: { kind: "specifier", value: "./custom-theme" },
        names: [{ imported: "customVar" }],
      },
    ],
  };
}

function customResolveSelector(_ctx: SelectorResolveContext): SelectorResolveResult | undefined {
  return undefined;
}

// Test adapters - examples of custom adapter usage
export const customAdapter = defineAdapter({
  styleMerger: null,
  externalInterface() {
    return null;
  },
  resolveValue: customResolveValue,
  resolveCall(_ctx) {
    return undefined;
  },
  resolveSelector: customResolveSelector,
});

import {
  defineAdapter,
  type ExternalInterfaceResult,
  type ResolveValueContext,
  type ResolveValueResult,
} from "../adapter.ts";

const externalStylingFilePaths = [
  "styled-element-html-props",
  "styled-input-html-props",
  "transient-prop-not-forwarded",
  "attrs-polymorphic-as",
  "external-styles-support",
];

const asPropFilePaths = ["exported-as-prop"];

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
    let styles = false;
    let asOnly = false;

    // Enable external styles for exported components in specific test cases where the expected
    // output includes className/style prop support and HTMLAttributes extension.
    if (externalStylingFilePaths.some((filePath) => ctx.filePath.includes(filePath))) {
      styles = true;
    }

    // wrapper-props-incomplete - TextColor and ThemeText should extend HTMLAttributes
    // Highlight wraps a component and shouldn't support external styles
    if (ctx.filePath.includes("wrapper-props-incomplete")) {
      if (ctx.componentName === "TextColor" || ctx.componentName === "ThemeText") {
        styles = true;
      }
    }

    // Enable `as` prop support (without styles) for exported components in selected fixtures.
    if (asPropFilePaths.some((filePath) => ctx.filePath.includes(filePath))) {
      asOnly = true;
    }

    // When styles is true, `as` is implicitly enabled
    if (styles) {
      return { styles: true };
    }
    // When only `as` is needed (no style merging)
    if (asOnly) {
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
      const combinedImport = {
        from: { kind: "specifier" as const, value: "./css-variables.stylex" },
        names: [{ imported: "vars" }, { imported: "textVars" }],
      };
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
      if (v) {
        return { expr: `vars.${v}`, imports: [combinedImport] };
      }
      const t = textVarsMap[name];
      if (t) {
        return { expr: `textVars.${t}`, imports: [combinedImport] };
      }
    }

    if (ctx.kind === "importedValue") {
      const source = ctx.source.value;
      if (!source.includes("lib/helpers") && !source.includes("lib\\helpers")) {
        return null;
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
    }

    return null;
  },
  resolveCall(ctx) {
    const src = ctx.calleeSource.value;
    // Note: calleeSource.value may or may not include the extension
    if (!src.includes("lib/helpers") && !src.includes("lib\\helpers")) {
      return null;
    }

    if (ctx.calleeImportedName === "gradient") {
      return {
        usage: "props",
        expr: "helpers.gradient",
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
        usage: "create",
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
    if (!key) {
      return null;
    }

    // Handle color() helper from ./lib/helpers.ts
    // color("bgBase") -> $colors.bgBase
    if (ctx.calleeImportedName === "color") {
      return {
        usage: "create",
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
        usage: "create",
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
        usage: "create",
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
        usage: "create",
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
    if (ctx.calleeImportedName === "themedBorder") {
      return {
        usage: "props",
        expr: `borders.${key}`,
        imports: [
          {
            from: { kind: "specifier", value: "./lib/helpers.stylex" },
            names: [{ imported: "borders" }],
          },
        ],
      };
    }

    return null;
  },
});

function customResolveValue(ctx: ResolveValueContext): ResolveValueResult | null {
  if (ctx.kind !== "theme") {
    return null;
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

// Test adapters - examples of custom adapter usage
export const customAdapter = defineAdapter({
  styleMerger: null,
  externalInterface() {
    return null;
  },
  resolveValue: customResolveValue,
  resolveCall(_ctx) {
    return null;
  },
});

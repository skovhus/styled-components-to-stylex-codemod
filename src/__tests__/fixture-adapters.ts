import { defineAdapter } from "../adapter.ts";

// Test adapters - examples of custom adapter usage
export const customAdapter = defineAdapter({
  styleMerger: null,
  shouldSupportExternalStyling() {
    return false;
  },
  resolveValue(ctx) {
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
  },
});

const externalStylingFilePaths = [
  "styled-element-html-props",
  "styled-input-html-props",
  "transient-prop-not-forwarded",
  "attrs-polymorphic-as",
];

// Fixtures don't use theme resolution, but the transformer requires an adapter.
export const fixtureAdapter = defineAdapter({
  // Use mergedSx merger function for cleaner className/style merging output
  // See test-cases/lib/mergedSx.ts for the implementation
  styleMerger: {
    functionName: "mergedSx",
    importSource: { kind: "specifier", value: "./lib/mergedSx" },
  },

  // Enable external styles for exported components in specific test cases where the expected
  // output includes className/style prop support and HTMLAttributes extension.
  shouldSupportExternalStyling(ctx) {
    // check if parts of ctx.filePath are in externalStylingFilePaths
    if (externalStylingFilePaths.some((filePath) => ctx.filePath.includes(filePath))) {
      return true;
    }

    // external-styles-support test case - only ExportedButton supports external styles
    if (ctx.filePath.includes("external-styles-support")) {
      return ctx.componentName === "ExportedButton";
    }

    // wrapper-props-incomplete - TextColor and ThemeText should extend HTMLAttributes
    // Highlight wraps a component and shouldn't support external styles
    if (ctx.filePath.includes("wrapper-props-incomplete")) {
      return ctx.componentName === "TextColor" || ctx.componentName === "ThemeText";
    }

    return false;
  },

  resolveValue(ctx) {
    if (ctx.kind === "theme") {
      // Test fixtures use a small ThemeProvider theme shape:
      //   props.theme.color.labelBase  -> themeVars.labelBase
      //   props.theme.color[bg]        -> themeVars[bg]
      //
      // `ctx.path` is the dot-path on the theme object (no bracket/index parts).
      if (ctx.path === "color") {
        return {
          expr: "themeVars",
          imports: [
            {
              from: { kind: "specifier", value: "./tokens.stylex" },
              names: [{ imported: "themeVars" }],
            },
          ],
        };
      }

      const lastSegment = ctx.path.split(".").pop();
      return {
        expr: `themeVars.${lastSegment}`,
        imports: [
          {
            from: { kind: "specifier", value: "./tokens.stylex" },
            names: [{ imported: "themeVars" }],
          },
        ],
      };
    }

    if (ctx.kind === "call") {
      const src = ctx.calleeSource.value;
      // Note: calleeSource.value may or may not include the extension
      if (!src.includes("lib/helpers") && !src.includes("lib\\helpers")) {
        return null;
      }

      const arg0 = ctx.args[0];
      const key = arg0?.kind === "literal" && typeof arg0.value === "string" ? arg0.value : null;

      if (!key) {
        return null;
      }

      // Handle color() helper from ./lib/helpers.ts
      // color("bgBase") -> themeVars.bgBase
      if (ctx.calleeImportedName === "color") {
        return {
          expr: `themeVars.${key}`,
          imports: [
            {
              from: { kind: "specifier", value: "./tokens.stylex" },
              names: [{ imported: "themeVars" }],
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

      // Handle transitionSpeedMs() helper from ./lib/helpers.ts
      // transitionSpeedMs("fast") -> transitionSpeedMsVars.fast
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
      if (ctx.calleeImportedName === "themedBorder") {
        return {
          expr: `borders.${key}`,
          imports: [
            {
              from: { kind: "specifier", value: "./helpers.stylex" },
              names: [{ imported: "borders" }],
            },
          ],
        };
      }

      return null;
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

    return null;
  },
});

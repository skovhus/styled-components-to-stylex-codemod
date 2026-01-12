import { defineAdapter } from "../adapter.ts";

// Test adapters - examples of custom adapter usage
export const customAdapter = defineAdapter({
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

// Fixtures don't use theme resolution, but the transformer requires an adapter.
export const fixtureAdapter = defineAdapter({
  // Enable external styles for exported components in specific test cases where the expected
  // output includes className/style prop support and HTMLAttributes extension.
  shouldSupportExternalStyling(ctx) {
    // external-styles-support test case - only ExportedButton supports external styles
    if (ctx.filePath.includes("external-styles-support")) {
      return ctx.componentName === "ExportedButton";
    }
    // styled-element-html-props - exported components should extend HTMLAttributes
    if (ctx.filePath.includes("styled-element-html-props")) {
      return true;
    }
    // styled-input-html-props - exported RangeInput should extend InputHTMLAttributes
    if (ctx.filePath.includes("styled-input-html-props")) {
      return true;
    }
    // wrapper-props-incomplete - TextColor and ThemeText should extend HTMLAttributes
    // Highlight wraps a component and shouldn't support external styles
    if (ctx.filePath.includes("wrapper-props-incomplete")) {
      return ctx.componentName === "TextColor" || ctx.componentName === "ThemeText";
    }
    // transient-prop-not-forwarded - Scrollable should support external styles
    if (ctx.filePath.includes("transient-prop-not-forwarded")) {
      return true;
    }
    // attrs-polymorphic-as - Label should support external styles
    if (ctx.filePath.includes("attrs-polymorphic-as")) {
      return true;
    }
    return false;
  },

  resolveValue(ctx) {
    if (ctx.kind === "theme") {
      // Test fixtures use a small ThemeProvider theme shape:
      //   props.theme.colors.labelBase  -> themeVars.labelBase
      //   props.theme.colors[bg]        -> themeVars[bg]
      //
      // `ctx.path` is the dot-path on the theme object (no bracket/index parts).
      if (ctx.path === "colors") {
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
      if (ctx.calleeSource.kind !== "absolutePath") {
        return null;
      }

      const src = ctx.calleeSource.value;
      // Note: calleeSource.value may or may not include the extension
      if (
        !src.endsWith("/test-cases/lib/helpers.ts") &&
        !src.endsWith("\\test-cases\\lib\\helpers.ts") &&
        !src.endsWith("/test-cases/lib/helpers") &&
        !src.endsWith("\\test-cases\\lib\\helpers")
      ) {
        return null;
      }

      // Handle color() helper from ./lib/helpers.ts
      // color("bgBase") -> themeVars.bgBase
      if (ctx.calleeImportedName === "color") {
        const arg0 = ctx.args[0];
        const colorName =
          arg0?.kind === "literal" && typeof arg0.value === "string" ? arg0.value : null;
        if (!colorName) {
          return null;
        }

        return {
          expr: `themeVars.${colorName}`,
          imports: [
            {
              from: { kind: "specifier", value: "./tokens.stylex" },
              names: [{ imported: "themeVars" }],
            },
          ],
        };
      }

      // Handle transitionSpeed() helper from ./lib/helpers.ts
      if (ctx.calleeImportedName === "transitionSpeed") {
        const arg0 = ctx.args[0];
        const key = arg0?.kind === "literal" && typeof arg0.value === "string" ? arg0.value : null;
        if (
          key !== "highlightFadeIn" &&
          key !== "highlightFadeOut" &&
          key !== "quickTransition" &&
          key !== "regularTransition" &&
          key !== "slowTransition"
        ) {
          return null;
        }

        return {
          expr: `transitionSpeedVars.${key}`,
          imports: [
            {
              from: { kind: "specifier", value: "./lib/helpers.stylex" },
              names: [{ imported: "transitionSpeed", local: "transitionSpeedVars" }],
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

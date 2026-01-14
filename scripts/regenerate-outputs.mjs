/* eslint-disable no-console */
import { applyTransform } from "jscodeshift/src/testUtils.js";
import transform from "../dist/transform.mjs";
import { readFileSync, writeFileSync, readdirSync } from "fs";
import { join, resolve } from "path";

// Full fixture adapter matching src/__tests__/fixture-adapters.ts
const fixtureAdapter = {
  // Use mergedSx merger function for cleaner className/style merging output
  // See test-cases/lib/mergedSx.ts for the implementation
  styleMerger: {
    functionName: "mergedSx",
    importSource: { kind: "specifier", value: "./lib/mergedSx" },
  },

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
      if (
        !src.endsWith("/test-cases/lib/helpers.ts") &&
        !src.endsWith("\\test-cases\\lib\\helpers.ts") &&
        !src.endsWith("/test-cases/lib/helpers") &&
        !src.endsWith("\\test-cases\\lib\\helpers")
      ) {
        return null;
      }

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

      const combinedImport = {
        from: { kind: "specifier", value: "./css-variables.stylex" },
        names: [{ imported: "vars" }, { imported: "textVars" }],
      };
      const varsMap = {
        "--color-primary": "colorPrimary",
        "--color-secondary": "colorSecondary",
        "--spacing-sm": "spacingSm",
        "--spacing-md": "spacingMd",
        "--spacing-lg": "spacingLg",
        "--border-radius": "borderRadius",
      };
      const textVarsMap = {
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
};

const projectRoot = join(import.meta.dirname, "..");
const testCasesDir = join(projectRoot, "test-cases");

const files = readdirSync(testCasesDir);
const inputFiles = files.filter(
  (f) =>
    f.endsWith(".input.tsx") && !f.startsWith("_unsupported.") && !f.startsWith("unsupported-"),
);

let updated = 0;
for (const inputFile of inputFiles) {
  const name = inputFile.replace(".input.tsx", "");
  const inputPath = join(testCasesDir, inputFile);
  const outputPath = join(testCasesDir, name + ".output.tsx");

  const input = readFileSync(inputPath, "utf8");
  const result = applyTransform(
    transform,
    { adapter: fixtureAdapter },
    { source: input, path: resolve(inputPath) },
    { parser: "tsx" },
  );

  if (result) {
    writeFileSync(outputPath, result);
    updated++;
    console.log(`Updated ${name}.output.tsx`);
  }
}

console.log(`\nUpdated ${updated} output files`);

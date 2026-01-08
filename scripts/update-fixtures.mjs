import { readdir, readFile, writeFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { applyTransform } from "jscodeshift/src/testUtils.js";
import { format } from "oxfmt";
import transform from "../dist/transform.mjs";
import { defineAdapter } from "../dist/index.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, "..");
const testCasesDir = join(repoRoot, "test-cases");

const fixtureAdapter = defineAdapter({
  shouldSupportExternalStyles(ctx) {
    return (
      ctx.filePath.includes("external-styles-support") && ctx.componentName === "ExportedButton"
    );
  },
  resolveValue(ctx) {
    if (ctx.kind === "theme") {
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
      if (ctx.calleeImportedName !== "transitionSpeed") {
        return null;
      }
      if (ctx.calleeSource.kind !== "absolutePath") {
        return null;
      }
      const src = ctx.calleeSource.value;
      if (
        !src.endsWith("/test-cases/lib/helpers.ts") &&
        !src.endsWith("\\test-cases\\lib\\helpers.ts")
      ) {
        return null;
      }
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
});

async function normalizeCode(code) {
  const { code: formatted } = await format("test.tsx", code);
  // Remove extra blank line before return statements in tiny wrapper components:
  //   const { ... } = props;
  //
  //   return (...)
  const cleaned = formatted.replace(
    /\n(\s*(?:const|let|var)\s+[^\n]+;\n)\n(\s*return\b)/g,
    "\n$1$2",
  );
  return cleaned.trimEnd() + "\n";
}

async function listFixtureNames() {
  const files = await readdir(testCasesDir);
  const inputNames = files
    .filter(
      (f) =>
        f.endsWith(".input.tsx") && !f.startsWith("_unsupported.") && !f.startsWith("unsupported-"),
    )
    .map((f) => f.replace(".input.tsx", ""));
  return inputNames.sort();
}

async function updateFixture(name) {
  const inputPath = join(testCasesDir, `${name}.input.tsx`);
  const outputPath = join(testCasesDir, `${name}.output.tsx`);
  const input = await readFile(inputPath, "utf-8");

  const result = applyTransform(
    transform,
    { adapter: fixtureAdapter },
    { source: input, path: inputPath },
    { parser: "tsx" },
  );
  const out = result || input;
  await writeFile(outputPath, await normalizeCode(out), "utf-8");
  return outputPath;
}

const args = new Set(process.argv.slice(2));
const only = args.has("--only") ? process.argv[process.argv.indexOf("--only") + 1] : null;

const targetNames = (() => {
  if (only) {
    return only
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  }
  // Default: update all fixtures that have outputs (excluding unsupported).
  return null;
})();

const names = targetNames ?? (await listFixtureNames());
for (const name of names) {
  // Skip when output file doesn't exist (should only happen for unsupported fixtures).
  const outPath = join(testCasesDir, `${name}.output.tsx`);
  try {
    await readFile(outPath, "utf-8");
  } catch {
    continue;
  }
  await updateFixture(name);
}

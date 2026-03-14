// For more info, see https://github.com/storybookjs/eslint-plugin-storybook#configuration-flat-config-format
import storybook from "eslint-plugin-storybook";

import stylex from "@stylexjs/eslint-plugin";
import tsParser from "@typescript-eslint/parser";

export default [
  {
    ignores: [
      "**/dist/**",
      "**/coverage/**",
      "**/node_modules/**",
      "**/storybook-static/**",
      "**/playground/dist/**",
      "**/src/**",
      "**/test-cases-next-to-tackle/**",
    ],
  },
  {
    files: ["**/*.{js,jsx,ts,tsx}"],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: "latest",
        sourceType: "module",
        ecmaFeatures: {
          jsx: true,
        },
      },
    },
    plugins: {
      stylex,
    },
    rules: {
      "stylex/no-conflicting-props": "error",
      "stylex/no-legacy-contextual-styles": "error",
      "stylex/no-lookahead-selectors": "error",
      "stylex/no-nonstandard-styles": "error",
      "stylex/no-unused": "error",
      "stylex/sort-keys": "off",
      "stylex/valid-shorthands": "error",

      "stylex/valid-styles": "error",
    },
  },

  // ── stylex/valid-styles false-positive overrides ──────────────────────
  // The @stylexjs/eslint-plugin cannot validate certain patterns that are
  // valid at runtime. Each override group documents the specific limitation.
  // All other stylex rules remain enforced for these files.

  {
    // Dynamic style function parameters: the rule cannot validate runtime
    // values passed as arrow-function params in stylex.create().
    files: [
      "test-cases/conditional-nullishCoalescing.output.tsx",
      "test-cases/conditional-runtimeCallBranch.output.tsx",
      "test-cases/conditional-runtimeCallLocal.output.tsx",
      "test-cases/helper-callPropArg.output.tsx",
      "test-cases/helper-memberCalleeMultiArg.output.tsx",
      "test-cases/interpolation-destructuredDefaults.output.tsx",
      "test-cases/interpolation-destructuredRename.output.tsx",
      "test-cases/keyframes-unionComplexity.output.tsx",
      "test-cases/mixin-dynamicArgDefault.output.tsx",
      "test-cases/selector-componentDynamicProp.output.tsx",
      "test-cases/selector-dynamicPseudoElement.output.tsx",
      "test-cases/theme-indexedLookupPropFallback.output.tsx",
      "test-cases/transientProp-memberExpression.output.tsx",
    ],
    rules: { "stylex/valid-styles": "off" },
  },
  {
    // Multi-animation comma values: the rule only validates single values
    // for animation-* longhand properties (e.g. "1, infinite" is rejected).
    files: ["test-cases/keyframes-multipleAnimations.output.tsx"],
    rules: { "stylex/valid-styles": "off" },
  },
  {
    // !important suffix: the rule doesn't parse "value !important" strings.
    files: ["test-cases/css-important.output.tsx"],
    rules: { "stylex/valid-styles": "off" },
  },
  {
    // Computed stylex.when.*() keys: rule reports "Keys must be strings"
    // for valid computed property keys like [stylex.when.siblingBefore(...)].
    files: [
      "test-cases/selector-componentSiblingCombinator.output.tsx",
      "test-cases/selector-siblingMedia.output.tsx",
    ],
    rules: { "stylex/valid-styles": "off" },
  },
  {
    // Numeric outlineOffset/strokeDasharray: rule rejects bare numbers
    // (e.g. outlineOffset: 2) that are valid CSS unitless values.
    files: [
      "test-cases/keyframes-inlineDefinition.output.tsx",
      "test-cases/selector-descendantComponent.output.tsx",
      "test-cases/selector-pseudoChained.output.tsx",
      "test-cases/selector-pseudoComma.output.tsx",
    ],
    rules: { "stylex/valid-styles": "off" },
  },

  ...storybook.configs["flat/recommended"],
];

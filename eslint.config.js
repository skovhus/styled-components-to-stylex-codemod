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
  {
    // stylex/valid-styles false positives: @stylexjs/eslint-plugin limitations
    // - Dynamic style fn params: rule can't validate runtime values
    // - Multi-animation comma values: rule only validates single values
    // - !important suffix: rule doesn't parse !important from value
    // - Computed stylex.when.*() keys: rule reports "Keys must be strings"
    // - outlineOffset/strokeDasharray numeric values: rule rejects valid numbers
    files: [
      "test-cases/conditional-runtimeCallBranch.output.tsx",
      "test-cases/conditional-runtimeCallLocal.output.tsx",
      "test-cases/conditional-runtimeCallThemeBool.output.tsx",
      "test-cases/css-important.output.tsx",
      "test-cases/helper-callPropArg.output.tsx",
      "test-cases/helper-memberCalleeMultiArg.output.tsx",
      "test-cases/interpolation-destructuredDefaults.output.tsx",
      "test-cases/interpolation-destructuredRename.output.tsx",
      "test-cases/keyframes-inlineDefinition.output.tsx",
      "test-cases/keyframes-multipleAnimations.output.tsx",
      "test-cases/mixin-dynamicArgDefault.output.tsx",
      "test-cases/selector-descendantComponent.output.tsx",
      "test-cases/selector-pseudoChained.output.tsx",
      "test-cases/selector-pseudoComma.output.tsx",
      "test-cases/selector-siblingMedia.output.tsx",
      "test-cases/theme-indexedLookupPropFallback.output.tsx",
    ],
    rules: {
      "stylex/valid-styles": "off",
    },
  },
  ...storybook.configs["flat/recommended"],
];

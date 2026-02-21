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

      // TODO: false positives with colors
      "stylex/valid-styles": "off",
    },
  },
  {
    // stylex.when.anySibling() uses :has() internally which has limited browser
    // support. The codemod generates this when transforming `& ~ &` (CSS general
    // sibling selector). Allow it in test case outputs.
    files: ["test-cases/selector-generalSibling.output.tsx"],
    rules: {
      "stylex/no-lookahead-selectors": "off",
    },
  },
  ...storybook.configs["flat/recommended"],
];

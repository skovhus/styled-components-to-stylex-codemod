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
    ],
  },
  {
    files: ["test-cases/**/*.{js,jsx,ts,tsx}"],
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
];

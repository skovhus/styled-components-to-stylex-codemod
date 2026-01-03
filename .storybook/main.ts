import type { StorybookConfig } from "@storybook/react-vite";
import stylex from "@stylexjs/unplugin";
import { resolve } from "node:path";

const config: StorybookConfig = {
  stories: ["../test-cases/**/*.stories.@(js|jsx|mjs|ts|tsx)"],
  framework: {
    name: "@storybook/react-vite",
    options: {},
  },
  viteFinal: async (config) => {
    config.plugins = config.plugins || [];

    // Storybook's Vite root is not the repo root; allow loading stories/fixtures from the repo.
    // Without this, dynamic story imports like `/test-cases/...` 404 under Vite's fs restrictions.
    config.server = {
      ...config.server,
      fs: {
        ...config.server?.fs,
        allow: Array.from(new Set([...(config.server?.fs?.allow ?? []), resolve(process.cwd())])),
      },
    };

    // Add StyleX plugin for processing .stylex.ts files
    config.plugins.unshift(
      stylex.vite({
        dev: true,
        unstable_moduleResolution: {
          type: "commonJS",
          rootDir: process.cwd(),
        },
      }),
    );

    // Force esbuild to treat .ts files as tsx with automatic JSX runtime
    config.esbuild = {
      ...config.esbuild,
      loader: "tsx",
      include: /\.(ts|tsx|js|jsx)$/,
      jsx: "automatic",
    };

    // Also configure optimizeDeps for pre-bundling
    config.optimizeDeps = {
      ...config.optimizeDeps,
      esbuildOptions: {
        ...config.optimizeDeps?.esbuildOptions,
        loader: {
          ".ts": "tsx",
        },
        jsx: "automatic",
      },
    };

    return config;
  },
};

export default config;

import type { StorybookConfig } from "@storybook/react-vite";
import stylex from "@stylexjs/unplugin";

const config: StorybookConfig = {
  stories: ["../src/**/*.stories.@(js|jsx|mjs|ts|tsx)"],
  framework: {
    name: "@storybook/react-vite",
    options: {},
  },
  viteFinal: async (config) => {
    config.plugins = config.plugins || [];

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

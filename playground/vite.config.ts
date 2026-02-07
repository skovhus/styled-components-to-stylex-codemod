import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import stylex from "@stylexjs/unplugin";
import path from "node:path";

export default defineConfig(({ command }) => {
  const isBuild = command === "build";

  return {
    root: path.resolve(__dirname),
    base: process.env.PLAYGROUND_BASE_PATH ?? "/styled-components-to-stylex-codemod/",
    plugins: [
      stylex.vite({
        // StyleX needs to extract CSS for production builds; in dev we keep it in dev mode.
        dev: !isBuild,
        unstable_moduleResolution: {
          type: "commonJS",
          rootDir: process.cwd(),
        },
      }),
      react(),
    ],
    define: {
      "process.env.NODE_DEBUG": "false",
    },
    resolve: {
      alias: {
        "node:fs": path.resolve(__dirname, "src/lib/fs-stub.ts"),
        "node:path": "path-browserify",
        path: "path-browserify",
        assert: "assert",
      },
    },
    build: {
      outDir: path.resolve(__dirname, "../dist-playground"),
      emptyOutDir: true,
    },
  };
});

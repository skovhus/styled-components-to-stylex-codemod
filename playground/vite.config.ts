import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { nodePolyfills } from "vite-plugin-node-polyfills";
import path from "node:path";

export default defineConfig({
  root: path.resolve(__dirname),
  base: "/styled-components-to-stylex-codemod/",
  plugins: [
    react(),
    nodePolyfills({
      include: ["path"],
    }),
  ],
  resolve: {
    alias: {
      "node:fs": path.resolve(__dirname, "src/lib/fs-stub.ts"),
    },
  },
  build: {
    outDir: path.resolve(__dirname, "../dist-playground"),
    emptyOutDir: true,
  },
});

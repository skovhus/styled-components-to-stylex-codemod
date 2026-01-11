import { defineConfig } from "tsdown";

export default defineConfig({
  entry: ["src/index.ts", "src/transform.ts", "src/__tests__/fixture-adapters.ts"],
  format: "esm",
  dts: true,
  clean: true,
  sourcemap: false,
  outDir: "dist",
  external: ["jscodeshift"],
});

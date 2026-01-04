import { defineConfig } from "tsdown";

export default defineConfig({
  entry: ["src/index.ts", "src/transform.ts", "src/run.ts", "src/adapter.ts"],
  format: "esm",
  dts: true,
  clean: true,
  sourcemap: true,
  outDir: "dist",
  external: ["jscodeshift"],
});

import { defineConfig } from "tsdown";

export default defineConfig({
  entry: ["src/index.ts", "src/transform.ts", "src/consumer-analyzer.ts"],
  format: "esm",
  dts: true,
  clean: true,
  sourcemap: false,
  outDir: "dist",
  external: ["jscodeshift", "oxc-resolver"],
});

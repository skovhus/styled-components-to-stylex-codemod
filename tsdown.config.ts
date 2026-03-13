import { defineConfig } from "tsdown";

export default defineConfig({
  entry: ["src/index.ts", "src/transform.ts"],
  format: "esm",
  dts: true,
  clean: false,
  sourcemap: false,
  outDir: "dist",
  external: ["jscodeshift", "oxc-resolver"],
});

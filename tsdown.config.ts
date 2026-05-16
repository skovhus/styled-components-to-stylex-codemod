import { defineConfig } from "tsdown";

export default defineConfig({
  entry: ["src/index.ts", "src/transform.ts"],
  format: "esm",
  dts: true,
  clean: true,
  sourcemap: false,
  outDir: "dist",
  deps: {
    neverBundle: ["jscodeshift", "oxc-resolver", "typescript"],
  },
});

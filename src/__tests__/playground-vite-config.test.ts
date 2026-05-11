import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { playgroundBrowserAliases } from "../../playground/vite.config";
import { createRequire } from "../../playground/src/lib/module-stub";

describe("playground Vite config", () => {
  it("aliases node:module to the browser stub", () => {
    expect(playgroundBrowserAliases["node:module"]).toBe(
      path.join(repoRoot, "playground/src/lib/module-stub.ts"),
    );
  });

  it("provides a createRequire stub that fails inside package-resolution probes", () => {
    const requireFromFile = createRequire("input.tsx");

    expect(() => requireFromFile.resolve("styled-components/package.json")).toThrow(
      "Module resolution through createRequire is unavailable in the playground.",
    );
  });
});

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

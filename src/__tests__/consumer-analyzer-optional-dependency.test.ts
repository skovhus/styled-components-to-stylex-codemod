import { afterEach, describe, expect, it, vi } from "vitest";

function createMissingModuleError(moduleName: string): Error & { code?: string } {
  const error = new Error(`Cannot find module '${moduleName}'`) as Error & { code?: string };
  error.code = "MODULE_NOT_FOUND";
  return error;
}

describe("createExternalInterface optional dependency handling", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
    vi.unmock("node:module");
  });

  it("logs and throws a helpful error when oxc-resolver is missing", async () => {
    vi.resetModules();
    const stderrWriteSpy = vi.spyOn(process.stderr, "write").mockReturnValue(true);

    vi.doMock("node:module", () => ({
      createRequire: () => (specifier: string) => {
        if (specifier === "oxc-resolver") {
          throw createMissingModuleError(specifier);
        }
        throw new Error(`Unexpected module request: ${specifier}`);
      },
    }));

    const { createExternalInterface } = await import("../consumer-analyzer.js");

    expect(() => createExternalInterface({ searchDirs: ["test-cases/"] })).toThrowError(
      /optional dependency `oxc-resolver`/u,
    );
    expect(stderrWriteSpy).toHaveBeenCalledWith(
      expect.stringContaining(
        "createExternalInterface requires the optional dependency `oxc-resolver`.",
      ),
    );
  });
});

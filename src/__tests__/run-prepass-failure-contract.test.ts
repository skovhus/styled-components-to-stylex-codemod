import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { join } from "node:path";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";

const SAMPLE_FILE = "src/__tests__/fixtures/cross-file/no-styled.tsx";
const PREPASS_FAILURE_MESSAGE = "simulated prepass crash";

interface RunnerResult {
  error: number;
  nochange: number;
  skip: number;
  ok: number;
  timeElapsed: string;
}

function createRunnerResult(): RunnerResult {
  return {
    error: 0,
    nochange: 0,
    skip: 0,
    ok: 1,
    timeElapsed: "0.01",
  };
}

function createLoggerMock(warnMock: ReturnType<typeof vi.fn>) {
  return {
    warn: warnMock,
    setMaxExamples: vi.fn(),
    setFileCount: vi.fn(),
    logError: vi.fn(),
    markErrorAsLogged: vi.fn(),
    createReport: () => ({
      print: vi.fn(),
      getWarnings: () => [],
    }),
  };
}

/* ── Sidecar file merge ───────────────────────────────────────────────── */

describe("mergeSidecarContent", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "sidecar-merge-"));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("returns new content when sidecar file does not exist", async () => {
    const { mergeSidecarContent } = await import("../run.js");
    const newContent = `import * as stylex from "@stylexjs/stylex";\n\nexport const ButtonMarker = stylex.defineMarker();\n`;
    const result = mergeSidecarContent(join(tmpDir, "nonexistent.stylex.ts"), newContent);
    expect(result).toBe(newContent);
  });

  it("preserves existing exports and appends new markers", async () => {
    const { mergeSidecarContent } = await import("../run.js");
    const existing = [
      'import * as stylex from "@stylexjs/stylex";',
      "",
      "export const themeVars = stylex.defineVars({ color: 'red' });",
      "",
    ].join("\n");
    const sidecarPath = join(tmpDir, "component.stylex.ts");
    writeFileSync(sidecarPath, existing, "utf-8");

    const newContent = `import * as stylex from "@stylexjs/stylex";\n\nexport const ButtonMarker = stylex.defineMarker();\n`;
    const result = mergeSidecarContent(sidecarPath, newContent);

    // Existing content must be preserved
    expect(result).toContain("themeVars");
    expect(result).toContain("defineVars");
    // New marker must be added
    expect(result).toContain("export const ButtonMarker = stylex.defineMarker();");
  });

  it("does not duplicate markers that already exist", async () => {
    const { mergeSidecarContent } = await import("../run.js");
    const existing = [
      'import * as stylex from "@stylexjs/stylex";',
      "",
      "export const ButtonMarker = stylex.defineMarker();",
      "",
    ].join("\n");
    const sidecarPath = join(tmpDir, "component.stylex.ts");
    writeFileSync(sidecarPath, existing, "utf-8");

    const newContent = `import * as stylex from "@stylexjs/stylex";\n\nexport const ButtonMarker = stylex.defineMarker();\n`;
    const result = mergeSidecarContent(sidecarPath, newContent);

    // Should return existing file unchanged
    expect(result).toBe(existing);
    // Should not duplicate the marker
    const count = (result.match(/ButtonMarker/g) ?? []).length;
    expect(count).toBe(1);
  });
});

/* ── Prepass failure contract ────────────────────────────────────────── */

describe("runTransform prepass failure contract", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('throws a clear error when prepass fails and externalInterface is "auto"', async () => {
    const runMock = vi.fn().mockResolvedValue(createRunnerResult());
    const warnMock = vi.fn();

    vi.doMock("jscodeshift/src/Runner.js", () => ({ run: runMock }));
    vi.doMock("../internal/prepass/run-prepass.js", () => ({
      runPrepass: vi.fn().mockRejectedValue(new Error(PREPASS_FAILURE_MESSAGE)),
    }));
    vi.doMock("../internal/logger.js", () => ({
      Logger: createLoggerMock(warnMock),
    }));
    vi.doMock("node:fs", async () => {
      const actual = await vi.importActual<typeof import("node:fs")>("node:fs");
      return {
        ...actual,
        existsSync: () => true,
        realpathSync: (p: import("node:fs").PathLike) => String(p),
      };
    });

    const { runTransform } = await import("../run.js");
    const adapter = {
      resolveValue: () => undefined,
      resolveCall: () => undefined,
      resolveSelector: () => undefined,
      externalInterface: "auto" as const,
      styleMerger: null,
    };

    const execution = runTransform({
      files: SAMPLE_FILE,
      consumerPaths: SAMPLE_FILE,
      adapter,
      dryRun: true,
    });
    await expect(execution).rejects.toThrowError(
      /prepass failed while using externalInterface: "auto"/i,
    );
    await expect(execution).rejects.toThrowError(new RegExp(PREPASS_FAILURE_MESSAGE));
    expect(runMock).not.toHaveBeenCalled();
    expect(warnMock).not.toHaveBeenCalled();
  });

  it("warns and continues when prepass fails and externalInterface is a function", async () => {
    const runMock = vi.fn().mockResolvedValue(createRunnerResult());
    const warnMock = vi.fn();

    vi.doMock("jscodeshift/src/Runner.js", () => ({ run: runMock }));
    vi.doMock("../internal/prepass/run-prepass.js", () => ({
      runPrepass: vi.fn().mockRejectedValue(new Error(PREPASS_FAILURE_MESSAGE)),
    }));
    vi.doMock("../internal/logger.js", () => ({
      Logger: createLoggerMock(warnMock),
    }));
    vi.doMock("node:fs", async () => {
      const actual = await vi.importActual<typeof import("node:fs")>("node:fs");
      return {
        ...actual,
        existsSync: () => true,
        realpathSync: (p: import("node:fs").PathLike) => String(p),
      };
    });

    const { runTransform } = await import("../run.js");
    const adapter = {
      resolveValue: () => undefined,
      resolveCall: () => undefined,
      resolveSelector: () => undefined,
      externalInterface: () => ({ styles: false, as: false }),
      styleMerger: null,
    };

    const result = await runTransform({
      files: SAMPLE_FILE,
      consumerPaths: SAMPLE_FILE,
      adapter,
      dryRun: true,
    });

    expect(result.errors).toBe(0);
    expect(runMock).toHaveBeenCalledTimes(1);
    expect(warnMock).toHaveBeenCalledWith(
      expect.stringContaining("Prepass failed, continuing without cross-file analysis"),
    );
  });
});

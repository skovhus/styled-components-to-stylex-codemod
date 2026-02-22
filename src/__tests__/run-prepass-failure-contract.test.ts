import { beforeEach, describe, expect, it, vi } from "vitest";

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

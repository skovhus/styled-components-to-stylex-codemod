import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

interface FixturePaths {
  root: string;
  componentFile: string;
  consumerFile: string;
}

function createFixture(): FixturePaths {
  const root = mkdtempSync(path.join(tmpdir(), "run-prepass-rg-prefilter-"));
  writeFileSync(
    path.join(root, "tsconfig.json"),
    JSON.stringify({ compilerOptions: { baseUrl: "." } }),
  );

  const componentsDir = path.join(root, "components");
  const consumersDir = path.join(root, "consumers");
  mkdirSync(componentsDir, { recursive: true });
  mkdirSync(consumersDir, { recursive: true });

  const componentFile = path.join(componentsDir, "button.ts");
  writeFileSync(
    componentFile,
    [
      'import styled from "styled-components";',
      "export const Button = styled.button`color: red;`;",
    ].join("\n"),
  );

  const consumerFile = path.join(consumersDir, "consumer.mts");
  writeFileSync(
    consumerFile,
    [
      'import styled from "styled-components";',
      'import { Button } from "../components/button";',
      "export const Wrapped = styled(Button)`color: blue;`;",
    ].join("\n"),
  );

  return { root, componentFile, consumerFile };
}

describe("runPrepass rg prefilter", () => {
  let fixture: FixturePaths;

  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    fixture = createFixture();
  });

  afterEach(() => {
    rmSync(fixture.root, { recursive: true, force: true });
  });

  it("includes .mts files in rg globs so externalInterface prepass stays complete", async () => {
    const realComponentFile = realpathSync(fixture.componentFile);
    const realConsumerFile = realpathSync(fixture.consumerFile);

    const execSyncMock = vi.fn((cmd: string) => {
      const matchedFiles = [realComponentFile];
      if (cmd.includes("--glob '*.mts'")) {
        matchedFiles.push(realConsumerFile);
      }
      return matchedFiles.join("\n");
    });

    vi.doMock("node:child_process", () => ({
      execSync: execSyncMock,
    }));

    const [{ runPrepass }, { createModuleResolver }] = await Promise.all([
      import("../internal/prepass/run-prepass.js"),
      import("../internal/prepass/resolve-imports.js"),
    ]);

    const result = await runPrepass({
      filesToTransform: [fixture.componentFile],
      consumerPaths: [fixture.consumerFile],
      resolver: createModuleResolver(),
      parserName: "ts",
      createExternalInterface: true,
      enableAstCache: true,
    });

    expect(execSyncMock).toHaveBeenCalledTimes(1);
    expect(execSyncMock.mock.calls[0]?.[0]).toContain("--glob '*.mts'");

    const key = `${realComponentFile}:Button`;
    expect(result.consumerAnalysis?.get(key)).toEqual({ styles: true, as: false });
  });
});

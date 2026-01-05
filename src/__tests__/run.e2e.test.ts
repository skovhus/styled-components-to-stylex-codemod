import { describe, it, expect } from "vitest";
import { mkdtemp, copyFile, mkdir, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { format } from "oxfmt";
import { runTransform } from "../run.js";
import { fixtureAdapters } from "./fixture-adapters.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const testCasesDir = join(__dirname, "..", "..", "test-cases");

async function normalizeCode(code: string): Promise<string> {
  const { code: formatted } = await format("test.tsx", code);
  return formatted.replace(/\n{3,}/g, "\n\n").trim();
}

describe("runTransform (e2e)", () => {
  it("transforms a fixture in a temp folder and matches the .output.tsx file", async () => {
    const fixtureName = "css-variables";
    const adapter = fixtureAdapters[fixtureName];
    expect(adapter, `missing adapter for fixture ${fixtureName}`).toBeTruthy();

    const tmp = await mkdtemp(join(tmpdir(), "styledx-run-e2e-"));
    const fixtureDir = join(tmp, fixtureName);
    await mkdir(fixtureDir, { recursive: true });

    const inputSrc = join(testCasesDir, `${fixtureName}.input.tsx`);
    const outputSrc = join(testCasesDir, `${fixtureName}.output.tsx`);
    const cssSrc = join(testCasesDir, `${fixtureName}.css`);

    const targetFile = join(fixtureDir, "App.tsx");
    await copyFile(inputSrc, targetFile);
    // Keep CSS import valid (not required for the codemod, but makes the e2e setup realistic)
    await copyFile(cssSrc, join(fixtureDir, `${fixtureName}.css`));

    const result = await runTransform({
      files: targetFile,
      adapter,
      dryRun: false,
      print: false,
      parser: "tsx",
    });

    expect(result.errors).toBe(0);
    expect(result.transformed).toBe(1);

    const actual = await readFile(targetFile, "utf-8");
    const expected = await readFile(outputSrc, "utf-8");

    expect(await normalizeCode(actual)).toBe(await normalizeCode(expected));
  });
});

import { transformWithWarnings } from "../dist/transform.mjs";
import { fixtureAdapter } from "../src/__tests__/fixture-adapters.ts";
import fs from "fs";
import path from "path";
import jscodeshift from "jscodeshift";

const j = jscodeshift.withParser("tsx");

const testCasesDir = "test-cases";
const files = fs.readdirSync(testCasesDir);
const inputFiles = files.filter(
  (f) =>
    f.endsWith(".input.tsx") && !f.startsWith("_unsupported.") && !f.startsWith("unsupported-"),
);

let updated = 0;
for (const inputFile of inputFiles) {
  const name = inputFile.replace(".input.tsx", "");
  const inputPath = path.join(testCasesDir, inputFile);
  const outputPath = path.join(testCasesDir, name + ".output.tsx");

  const input = fs.readFileSync(inputPath, "utf-8");
  const result = transformWithWarnings(
    { source: input, path: path.resolve(inputPath) },
    { jscodeshift: j, j },
    { adapter: fixtureAdapter },
  );

  if (result.code) {
    fs.writeFileSync(outputPath, result.code);
    updated++;
  }
}

process.stdout.write("Updated " + updated + " output files\n");

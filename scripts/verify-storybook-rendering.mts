/**
 * Verify that storybook renders Input (styled-components) and Output (StyleX)
 * panels with matching dimensions and content for each test case.
 *
 * This script launches a headless browser via `playwright` to render each story
 * and compare the Input vs Output panels.
 *
 * Prerequisites:
 *   - Storybook dev server running (pnpm storybook)
 *   - `npx playwright install chromium` (one-time setup)
 *
 * Usage:
 *   node scripts/verify-storybook-rendering.mts                     # check all test cases
 *   node scripts/verify-storybook-rendering.mts bug-tab-index       # check specific cases
 *   node scripts/verify-storybook-rendering.mts --port 6006         # custom storybook port
 *   node scripts/verify-storybook-rendering.mts --only-changed      # only test cases changed vs main
 */

/* oxlint-disable no-console */

import { execSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { join } from "node:path";

// ---------------------------------------------------------------------------
// CLI argument parsing
// ---------------------------------------------------------------------------
const cliArgs = process.argv.slice(2);

let port = 6006;
let onlyChanged = false;
const explicitCases: string[] = [];

for (let i = 0; i < cliArgs.length; i++) {
  const arg = cliArgs[i]!;
  if (arg === "--port" && cliArgs[i + 1]) {
    port = Number(cliArgs[++i]);
  } else if (arg === "--only-changed") {
    onlyChanged = true;
  } else if (!arg.startsWith("-")) {
    explicitCases.push(arg);
  }
}

// ---------------------------------------------------------------------------
// Discover test cases
// ---------------------------------------------------------------------------
const projectRoot = join(import.meta.dirname, "..");
const testCasesDir = join(projectRoot, "test-cases");

function discoverAllTestCases(): string[] {
  const files = readdirSync(testCasesDir);
  const names = new Set<string>();
  for (const f of files) {
    const match = f.match(/^(.+)\.input\.tsx$/);
    if (match && !f.startsWith("_unsupported.")) {
      if (files.includes(`${match[1]}.output.tsx`)) {
        names.add(match[1]!);
      }
    }
  }
  return [...names].sort();
}

function discoverChangedTestCases(): string[] {
  const diff = execSync("git diff origin/main --name-only -- 'test-cases/*.input.tsx'", {
    encoding: "utf8",
    cwd: projectRoot,
  });
  const names: string[] = [];
  for (const line of diff.trim().split("\n")) {
    if (!line) {
      continue;
    }
    const match = line.match(/test-cases\/(.+)\.input\.tsx$/);
    if (match && !match[1]!.startsWith("_unsupported.")) {
      names.push(match[1]!);
    }
  }
  return names.sort();
}

let testCases: string[];
if (explicitCases.length > 0) {
  testCases = explicitCases;
} else if (onlyChanged) {
  testCases = discoverChangedTestCases();
} else {
  testCases = discoverAllTestCases();
}

if (testCases.length === 0) {
  console.log("No test cases to check.");
  process.exit(0);
}

// ---------------------------------------------------------------------------
// Verify storybook is running
// ---------------------------------------------------------------------------
const baseUrl = `http://localhost:${port}`;
try {
  await fetch(baseUrl, { signal: AbortSignal.timeout(3000) });
} catch {
  console.error(
    `\x1b[31mError: Storybook is not running at ${baseUrl}\x1b[0m\n` +
      "Start it with: pnpm storybook" +
      (port !== 6006 ? ` --port ${port}` : ""),
  );
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Launch browser
// ---------------------------------------------------------------------------
let chromium: typeof import("playwright").chromium;
try {
  let pw: typeof import("playwright");
  try {
    pw = await import("playwright");
  } catch {
    // Fall back to globally installed playwright
    const globalRoot = execSync("npm root -g", { encoding: "utf8" }).trim();
    pw = await import(join(globalRoot, "playwright", "index.mjs"));
  }
  chromium = pw.chromium;
} catch {
  console.error(
    "\x1b[31mError: playwright is not installed.\x1b[0m\n" +
      "Install it with: npm install -g playwright && npx playwright install chromium",
  );
  process.exit(1);
}

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1200, height: 800 } });
const page = await context.newPage();

// ---------------------------------------------------------------------------
// Check each test case
// ---------------------------------------------------------------------------
interface TestResult {
  name: string;
  status: "pass" | "dimension-mismatch" | "content-mismatch" | "error";
  inputDimensions: string | null;
  outputDimensions: string | null;
  inputText: string;
  outputText: string;
  message?: string;
}

const results: TestResult[] = [];

console.log(`Checking ${testCases.length} test case(s) against storybook at ${baseUrl}...\n`);

for (const tc of testCases) {
  const url = `${baseUrl}/iframe.html?id=test-cases--${tc}&viewMode=story`;

  try {
    await page.goto(url, { waitUntil: "networkidle", timeout: 15000 });
    // Wait for React rendering + ResizeObserver to fire
    await page.waitForTimeout(1500);

    const data = await page.evaluate(() => {
      const headings = Array.from(document.querySelectorAll("h3"));
      const inputHeading = headings.find((h) => h.textContent?.includes("Input"));
      const outputHeading = headings.find((h) => h.textContent?.includes("Output"));

      if (!inputHeading || !outputHeading) {
        return { error: "Missing Input/Output headings" };
      }

      const inputPanel = inputHeading.parentElement;
      const outputPanel = outputHeading.parentElement;

      if (!inputPanel || !outputPanel) {
        return { error: "Missing panel containers" };
      }

      function findDimensions(panel: Element): string[] {
        const dims: string[] = [];
        panel.querySelectorAll("*").forEach((el) => {
          const text = el.textContent?.trim();
          if (text && /^\d+×\d+$/.test(text) && el.children.length === 0) {
            dims.push(text);
          }
        });
        return dims;
      }

      function getVisibleText(panel: Element): string {
        const clone = panel.cloneNode(true) as Element;
        clone.querySelectorAll("*").forEach((el) => {
          const text = el.textContent?.trim();
          if (text && /^\d+×\d+$/.test(text) && el.children.length === 0) {
            el.remove();
          }
        });
        const h3 = clone.querySelector("h3");
        if (h3) {
          h3.remove();
        }
        return (clone.textContent ?? "").replace(/\s+/g, " ").trim();
      }

      return {
        inputDimensions: findDimensions(inputPanel),
        outputDimensions: findDimensions(outputPanel),
        inputText: getVisibleText(inputPanel),
        outputText: getVisibleText(outputPanel),
      };
    });

    if ("error" in data) {
      results.push({
        name: tc,
        status: "error",
        inputDimensions: null,
        outputDimensions: null,
        inputText: "",
        outputText: "",
        message: data.error,
      });
      continue;
    }

    const inputDim = data.inputDimensions.join(", ");
    const outputDim = data.outputDimensions.join(", ");
    const dimsMatch = inputDim === outputDim;
    const textMatch = data.inputText === data.outputText;

    let status: TestResult["status"] = "pass";
    let message: string | undefined;

    if (!dimsMatch) {
      status = "dimension-mismatch";
      message = `Dimensions differ: Input(${inputDim}) vs Output(${outputDim})`;
    } else if (!textMatch) {
      status = "content-mismatch";
      message = `Text differs:\n    Input:  "${data.inputText.substring(0, 100)}"\n    Output: "${data.outputText.substring(0, 100)}"`;
    }

    results.push({
      name: tc,
      status,
      inputDimensions: inputDim || null,
      outputDimensions: outputDim || null,
      inputText: data.inputText,
      outputText: data.outputText,
      message,
    });
  } catch (e) {
    results.push({
      name: tc,
      status: "error",
      inputDimensions: null,
      outputDimensions: null,
      inputText: "",
      outputText: "",
      message: e instanceof Error ? e.message : String(e),
    });
  }
}

await browser.close();

// ---------------------------------------------------------------------------
// Print results
// ---------------------------------------------------------------------------
let failCount = 0;

for (const r of results) {
  const icon =
    r.status === "pass"
      ? "\x1b[32m✓\x1b[0m"
      : r.status === "error"
        ? "\x1b[33m!\x1b[0m"
        : "\x1b[31m✗\x1b[0m";
  const dims = r.inputDimensions ? ` (${r.inputDimensions})` : "";
  console.log(`  ${icon} ${r.name}${dims}`);
  if (r.message) {
    console.log(`    ${r.message}`);
  }
  if (r.status !== "pass") {
    failCount++;
  }
}

console.log(
  `\n${results.length} checked, ${results.length - failCount} passed` +
    (failCount > 0 ? `, \x1b[31m${failCount} failed\x1b[0m` : ""),
);

process.exit(failCount > 0 ? 1 : 0);

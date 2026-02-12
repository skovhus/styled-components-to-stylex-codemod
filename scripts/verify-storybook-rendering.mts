/**
 * Verify that storybook renders Input (styled-components) and Output (StyleX)
 * panels with matching dimensions, content, and visual appearance for each test case.
 *
 * This script is self-contained: it builds Storybook, starts a lightweight
 * static file server, launches a headless Chromium browser via Playwright,
 * and compares the Input vs Output panels using pixelmatch for pixel-level
 * image comparison.
 *
 * Runs test cases in parallel across multiple browser pages for speed.
 *
 * Prerequisites (handled automatically):
 *   - `pnpm install` (playwright, pixelmatch, pngjs as devDependencies)
 *   - Playwright chromium browser (auto-installed on first run)
 *
 * Usage:
 *   node scripts/verify-storybook-rendering.mts                     # check all test cases
 *   node scripts/verify-storybook-rendering.mts theme-conditional   # check specific cases
 *   node scripts/verify-storybook-rendering.mts --only-changed      # only test cases changed vs main
 *   node scripts/verify-storybook-rendering.mts --save-diffs        # save diff images to .rendering-diffs/
 *   node scripts/verify-storybook-rendering.mts --threshold 0.1     # custom pixelmatch threshold (0-1)
 *   node scripts/verify-storybook-rendering.mts --mismatch-tolerance 0.005  # allow up to 0.5% pixel mismatch
 *   node scripts/verify-storybook-rendering.mts --concurrency 8     # number of parallel browser pages
 */

/* oxlint-disable no-console */

import { execSync } from "node:child_process";
import { mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import http from "node:http";
import { extname, join } from "node:path";

import pixelmatch from "pixelmatch";
import { chromium } from "playwright";
import { PNG } from "pngjs";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface TestResult {
  name: string;
  status: "pass" | "dimension-mismatch" | "content-mismatch" | "screenshot-mismatch" | "error";
  inputDimensions: string | null;
  outputDimensions: string | null;
  inputText: string;
  outputText: string;
  message?: string;
}

// ---------------------------------------------------------------------------
// Known rendering mismatches (expected failures).
// These are tracked in plans/2026-02-12-rendering-mismatches.md.
// Remove entries as the underlying codemod issues are fixed.
// ---------------------------------------------------------------------------
const EXPECTED_FAILURES = new Set<string>([]);

type Page = Awaited<ReturnType<Awaited<ReturnType<typeof chromium.launch>>["newPage"]>>;

// ---------------------------------------------------------------------------
// CLI argument parsing
// ---------------------------------------------------------------------------
const cliArgs = process.argv.slice(2);

let onlyChanged = false;
let saveDiffs = false;
let threshold = 0.1;
let mismatchTolerance = 0.02; // allow up to 2% of pixels to differ (subpixel text antialiasing)
let concurrency = 6;
const explicitCases: string[] = [];

for (let i = 0; i < cliArgs.length; i++) {
  const arg = cliArgs[i]!;
  if (arg === "--only-changed") {
    onlyChanged = true;
  } else if (arg === "--save-diffs") {
    saveDiffs = true;
  } else if (arg === "--threshold" && cliArgs[i + 1]) {
    threshold = Number(cliArgs[++i]);
  } else if (arg === "--mismatch-tolerance" && cliArgs[i + 1]) {
    mismatchTolerance = Number(cliArgs[++i]);
  } else if (arg === "--concurrency" && cliArgs[i + 1]) {
    concurrency = Number(cliArgs[++i]);
  } else if (!arg.startsWith("-")) {
    explicitCases.push(arg);
  }
}

// ---------------------------------------------------------------------------
// Discover test cases
// ---------------------------------------------------------------------------
const projectRoot = join(import.meta.dirname, "..");
const testCasesDir = join(projectRoot, "test-cases");
const storybookStaticDir = join(projectRoot, "storybook-static");
const diffsDir = join(projectRoot, ".rendering-diffs");

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
// Build Storybook (always, to avoid stale assets)
// ---------------------------------------------------------------------------
console.log("Building Storybook...");
execSync("pnpm storybook:build", { cwd: projectRoot, stdio: "inherit" });

// ---------------------------------------------------------------------------
// Static file server for storybook-static/
// ---------------------------------------------------------------------------
const MIME_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".mjs": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".eot": "application/vnd.ms-fontobject",
  ".ico": "image/x-icon",
  ".map": "application/json",
  ".txt": "text/plain; charset=utf-8",
};

function startStaticServer(root: string): Promise<{ server: http.Server; port: number }> {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const url = new URL(req.url!, "http://localhost");
      let filePath = join(root, decodeURIComponent(url.pathname));

      try {
        if (statSync(filePath).isDirectory()) {
          filePath = join(filePath, "index.html");
        }
      } catch {
        // file doesn't exist, handled below
      }

      const ext = extname(filePath);
      const contentType = MIME_TYPES[ext] ?? "application/octet-stream";

      try {
        const data = readFileSync(filePath);
        res.writeHead(200, { "Content-Type": contentType });
        res.end(data);
      } catch {
        res.writeHead(404);
        res.end("Not found");
      }
    });

    server.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      const port = typeof addr === "string" ? parseInt(addr) : addr!.port;
      resolve({ server, port });
    });
  });
}

const { server, port } = await startStaticServer(storybookStaticDir);
const baseUrl = `http://127.0.0.1:${port}`;

// ---------------------------------------------------------------------------
// Launch browser (auto-install Chromium if needed)
// ---------------------------------------------------------------------------
let browser;
try {
  browser = await chromium.launch({ headless: true });
} catch {
  console.log("Installing Playwright Chromium browser...");
  execSync("npx playwright install --with-deps chromium", {
    cwd: projectRoot,
    stdio: "inherit",
  });
  browser = await chromium.launch({ headless: true });
}

const context = await browser.newContext({ viewport: { width: 1200, height: 800 } });

// ---------------------------------------------------------------------------
// Screenshot comparison using pixelmatch
// ---------------------------------------------------------------------------

/**
 * Takes screenshots of the input and output content areas (inside the debug
 * frame) and compares them pixel-by-pixel using pixelmatch.
 *
 * Returns a mismatch description and optional diff PNG, or `null` when both
 * sides are visually identical.
 */
async function compareRenderedPanels(
  p: Page,
): Promise<{ message: string; diffPng: Buffer | null } | null> {
  // Locate the two RenderDebugFrame host divs via their distinctive background style.
  const debugFrames = p.locator('div[style*="repeating-linear-gradient"]');
  const count = await debugFrames.count();
  if (count < 2) {
    return null;
  }

  const inputFrame = debugFrames.nth(0);
  const outputFrame = debugFrames.nth(1);

  const [inputShot, outputShot] = await Promise.all([
    inputFrame.screenshot(),
    outputFrame.screenshot(),
  ]);

  const imgA = PNG.sync.read(inputShot);
  const imgB = PNG.sync.read(outputShot);

  if (imgA.width !== imgB.width || imgA.height !== imgB.height) {
    return {
      message: `Screenshot sizes differ: ${imgA.width}\u00d7${imgA.height} vs ${imgB.width}\u00d7${imgB.height}`,
      diffPng: null,
    };
  }

  const { width, height } = imgA;
  const diff = new PNG({ width, height });

  const mismatchCount = pixelmatch(imgA.data, imgB.data, diff.data, width, height, {
    threshold,
  });

  const totalPixels = width * height;

  if (mismatchCount === 0 || mismatchCount / totalPixels <= mismatchTolerance) {
    return null;
  }

  const pct = ((mismatchCount / totalPixels) * 100).toFixed(1);

  return {
    message: `Visual mismatch: ${mismatchCount} of ${totalPixels} pixels differ (${pct}%)`,
    diffPng: PNG.sync.write(diff),
  };
}

// ---------------------------------------------------------------------------
// Evaluate page data (dimensions + text) from the current story
// ---------------------------------------------------------------------------
function evaluateStoryData() {
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
}

// ---------------------------------------------------------------------------
// Process a single test case on a given page
// ---------------------------------------------------------------------------
async function processTestCase(p: Page, tc: string): Promise<TestResult> {
  // Storybook auto-generates story IDs by kebab-casing the display name, e.g.
  // "theme-conditionalInlineStyle" -> "theme-conditional-inline-style".
  const storyId = tc.replace(/[A-Z]/g, (ch) => `-${ch.toLowerCase()}`);
  const url = `${baseUrl}/iframe.html?id=test-cases--${storyId}&viewMode=story`;

  try {
    await p.goto(url, { waitUntil: "load", timeout: 15_000 });

    // Wait for React to render the story (both headings appear)
    await p.waitForSelector("h3", { timeout: 10_000 });

    // Wait for ResizeObserver dimension labels to appear (NNN×NNN).
    // Uses a targeted selector for the monospace-styled label divs.
    // Falls back after timeout — some stories may have no measurable content.
    await p
      .waitForFunction(
        () => {
          const els = document.querySelectorAll('div[style*="ui-monospace"]');
          for (const el of els) {
            if (/\d+×\d+/.test(el.textContent ?? "")) {
              return true;
            }
          }
          return false;
        },
        { timeout: 3_000 },
      )
      .catch(() => {});

    // Wait for all <img> elements to finish loading (or error) so that
    // external images (e.g. picsum.photos) don't cause nondeterministic
    // screenshots depending on network timing.
    await p
      .waitForFunction(
        () => {
          const images = document.querySelectorAll("img");
          return Array.from(images).every((img) => img.complete);
        },
        { timeout: 10_000 },
      )
      .catch(() => {});

    // Freeze CSS keyframe animations so screenshots are deterministic.
    // Only targets CSSAnimation instances (not CSSTransition) to avoid
    // disturbing transition-dependent layouts or image loading states.
    // Also blur any focused element so that focus rings (which can only
    // appear on one element per page) don't cause mismatches between panels.
    await p.evaluate(() => {
      for (const animation of document.getAnimations()) {
        if (animation instanceof CSSAnimation) {
          animation.currentTime = 0;
          animation.pause();
        }
      }
      if (document.activeElement instanceof HTMLElement) {
        document.activeElement.blur();
      }
    });

    const data = await p.evaluate(evaluateStoryData);

    if ("error" in data) {
      return {
        name: tc,
        status: "error",
        inputDimensions: null,
        outputDimensions: null,
        inputText: "",
        outputText: "",
        message: data.error,
      };
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

    // Pixel-level screenshot comparison of the rendered content areas
    if (status === "pass") {
      const comparison = await compareRenderedPanels(p);
      if (comparison) {
        status = "screenshot-mismatch";
        message = comparison.message;

        if (saveDiffs && comparison.diffPng) {
          writeFileSync(join(diffsDir, `${tc}.diff.png`), comparison.diffPng);
        }
      }
    }

    return {
      name: tc,
      status,
      inputDimensions: inputDim || null,
      outputDimensions: outputDim || null,
      inputText: data.inputText,
      outputText: data.outputText,
      message,
    };
  } catch (e) {
    return {
      name: tc,
      status: "error",
      inputDimensions: null,
      outputDimensions: null,
      inputText: "",
      outputText: "",
      message: e instanceof Error ? e.message : String(e),
    };
  }
}

// ---------------------------------------------------------------------------
// Run all test cases in parallel across multiple browser pages
// ---------------------------------------------------------------------------
if (saveDiffs) {
  mkdirSync(diffsDir, { recursive: true });
}

const workerCount = Math.min(concurrency, testCases.length);
const workerPages = await Promise.all(Array.from({ length: workerCount }, () => context.newPage()));

// Warm up the first page so the JS bundle is cached for all workers.
// Subsequent navigations by other pages will hit the browser's disk/memory cache.
const warmupPage = workerPages[0]!;
await warmupPage.goto(`${baseUrl}/iframe.html?id=test-cases--all&viewMode=story`, {
  waitUntil: "load",
  timeout: 30_000,
});

const results: TestResult[] = Array.from({ length: testCases.length }) as TestResult[];
let nextIndex = 0;
let completedCount = 0;

console.log(`Checking ${testCases.length} test case(s) with ${workerCount} workers...\n`);

async function worker(workerPage: Page) {
  while (nextIndex < testCases.length) {
    const idx = nextIndex++;
    const tc = testCases[idx]!;
    results[idx] = await processTestCase(workerPage, tc);
    completedCount++;
    process.stdout.write(`\r  Progress: ${completedCount}/${testCases.length}`);
  }
}

await Promise.all(workerPages.map(worker));
process.stdout.write("\r" + " ".repeat(40) + "\r"); // clear progress line

// ---------------------------------------------------------------------------
// Cleanup
// ---------------------------------------------------------------------------
await browser.close();
server.close();

// ---------------------------------------------------------------------------
// Print results
// ---------------------------------------------------------------------------
let failCount = 0;
let expectedFailCount = 0;

for (const r of results) {
  const isExpected = r.status !== "pass" && EXPECTED_FAILURES.has(r.name);
  if (isExpected) {
    expectedFailCount++;
  }
  const icon =
    r.status === "pass"
      ? "\x1b[32m\u2713\x1b[0m"
      : isExpected
        ? "\x1b[33m~\x1b[0m"
        : r.status === "error"
          ? "\x1b[33m!\x1b[0m"
          : "\x1b[31m\u2717\x1b[0m";
  const suffix = isExpected ? " (known)" : "";
  const dims = r.inputDimensions ? ` (${r.inputDimensions})` : "";
  console.log(`  ${icon} ${r.name}${dims}${suffix}`);
  if (r.message) {
    console.log(`    ${r.message}`);
  }
  if (r.status !== "pass" && !isExpected) {
    failCount++;
  }
}

// Warn about expected failures that now pass (should be removed from the list)
for (const name of EXPECTED_FAILURES) {
  const r = results.find((res) => res.name === name);
  if (r && r.status === "pass") {
    console.log(
      `\n\x1b[33mNote:\x1b[0m ${name} is in EXPECTED_FAILURES but now passes — remove it`,
    );
  }
}

const totalFailing = failCount + expectedFailCount;
const parts = [`${results.length} checked, ${results.length - totalFailing} passed`];
if (expectedFailCount > 0) {
  parts.push(`\x1b[33m${expectedFailCount} known\x1b[0m`);
}
if (failCount > 0) {
  parts.push(`\x1b[31m${failCount} failed\x1b[0m`);
}
console.log(`\n${parts.join(", ")}`);

if (saveDiffs && totalFailing > 0) {
  console.log(`Diff images saved to ${diffsDir}/`);
}

process.exit(failCount > 0 ? 1 : 0);

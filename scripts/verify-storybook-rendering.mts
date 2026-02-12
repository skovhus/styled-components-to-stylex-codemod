/**
 * Verify that storybook renders Input (styled-components) and Output (StyleX)
 * panels with matching dimensions, content, and visual appearance for each test case.
 *
 * This script is self-contained: it builds Storybook (if needed), starts a
 * lightweight static file server, launches a headless Chromium browser via
 * Playwright, and compares the Input vs Output panels using pixelmatch for
 * pixel-level image comparison.
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
 */

/* oxlint-disable no-console */

import { execSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import http from "node:http";
import { extname, join } from "node:path";

import pixelmatch from "pixelmatch";
import { chromium } from "playwright";
import { PNG } from "pngjs";

// ---------------------------------------------------------------------------
// CLI argument parsing
// ---------------------------------------------------------------------------
const cliArgs = process.argv.slice(2);

let onlyChanged = false;
let saveDiffs = false;
let threshold = 0.1;
const explicitCases: string[] = [];

for (let i = 0; i < cliArgs.length; i++) {
  const arg = cliArgs[i]!;
  if (arg === "--only-changed") {
    onlyChanged = true;
  } else if (arg === "--save-diffs") {
    saveDiffs = true;
  } else if (arg === "--threshold" && cliArgs[i + 1]) {
    threshold = Number(cliArgs[++i]);
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
// Build Storybook if needed
// ---------------------------------------------------------------------------
if (!existsSync(storybookStaticDir)) {
  console.log("Storybook build not found. Building...");
  execSync("pnpm storybook:build", { cwd: projectRoot, stdio: "inherit" });
}

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
console.log(`Serving storybook-static at ${baseUrl}`);

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
const page = await context.newPage();

// ---------------------------------------------------------------------------
// Screenshot comparison using pixelmatch
// ---------------------------------------------------------------------------

type Page = typeof page;

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

  if (mismatchCount === 0) {
    return null;
  }

  const totalPixels = width * height;
  const pct = ((mismatchCount / totalPixels) * 100).toFixed(1);

  return {
    message: `Visual mismatch: ${mismatchCount} of ${totalPixels} pixels differ (${pct}%)`,
    diffPng: PNG.sync.write(diff),
  };
}

// ---------------------------------------------------------------------------
// Check each test case
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

const results: TestResult[] = [];

if (saveDiffs) {
  mkdirSync(diffsDir, { recursive: true });
}

console.log(`\nChecking ${testCases.length} test case(s)...\n`);

for (const tc of testCases) {
  // Storybook auto-generates story IDs by kebab-casing the display name, e.g.
  // "theme-conditionalInlineStyle" -> "theme-conditional-inline-style".
  const storyId = tc.replace(/[A-Z]/g, (ch) => `-${ch.toLowerCase()}`);
  const url = `${baseUrl}/iframe.html?id=test-cases--${storyId}&viewMode=story`;

  try {
    await page.goto(url, { waitUntil: "networkidle", timeout: 15_000 });
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

    // Pixel-level screenshot comparison of the rendered content areas
    if (status === "pass") {
      const comparison = await compareRenderedPanels(page);
      if (comparison) {
        status = "screenshot-mismatch";
        message = comparison.message;

        if (saveDiffs && comparison.diffPng) {
          writeFileSync(join(diffsDir, `${tc}.diff.png`), comparison.diffPng);
        }
      }
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

// ---------------------------------------------------------------------------
// Cleanup
// ---------------------------------------------------------------------------
await browser.close();
server.close();

// ---------------------------------------------------------------------------
// Print results
// ---------------------------------------------------------------------------
let failCount = 0;

for (const r of results) {
  const icon =
    r.status === "pass"
      ? "\x1b[32m\u2713\x1b[0m"
      : r.status === "error"
        ? "\x1b[33m!\x1b[0m"
        : "\x1b[31m\u2717\x1b[0m";
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

if (saveDiffs && failCount > 0) {
  console.log(`Diff images saved to ${diffsDir}/`);
}

process.exit(failCount > 0 ? 1 : 0);

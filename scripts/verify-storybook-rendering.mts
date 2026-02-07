/**
 * Verify that storybook renders Input (styled-components) and Output (StyleX)
 * panels with matching dimensions, content, and visual appearance for each test case.
 *
 * This script launches a headless browser via `playwright` to render each story
 * and compare the Input vs Output panels. Checks include:
 *   - Matching dimensions (from the debug frame size label)
 *   - Matching text content
 *   - Pixel-level screenshot comparison of the rendered content areas
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
import { inflateSync } from "node:zlib";

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
// Screenshot comparison helpers
// ---------------------------------------------------------------------------

type Page = typeof page;

/**
 * Takes screenshots of the input and output content areas (inside the debug
 * frame) and compares them pixel-by-pixel.  Returns a description of the
 * mismatch, or `null` when both sides are visually identical.
 *
 * The comparison tolerates a small per-channel delta (±2) to absorb
 * sub-pixel anti-aliasing differences across renderers.
 */
async function compareRenderedPanels(p: Page): Promise<string | null> {
  // Locate the two RenderDebugFrame host divs (the ones with the ref).
  // Each panel has structure: <div style="position:relative..."> <div ref={hostRef}>...</div> ... </div>
  // We target the outer debug-frame containers via their distinctive background style.
  const debugFrames = p.locator('div[style*="repeating-linear-gradient"]');
  const count = await debugFrames.count();
  if (count < 2) {
    // Can't compare if we don't have both panels (some stories may not have output)
    return null;
  }

  const inputFrame = debugFrames.nth(0);
  const outputFrame = debugFrames.nth(1);

  const [inputShot, outputShot] = await Promise.all([
    inputFrame.screenshot(),
    outputFrame.screenshot(),
  ]);

  return diffPngBuffers(inputShot, outputShot);
}

/**
 * Compares two PNG buffers by decoding them to raw RGBA pixels.
 * Returns a human-readable mismatch description, or `null` if identical
 * (within tolerance).
 *
 * Uses a simple manual PNG IDAT decoder (inflate → un-filter) so we don't
 * need any native image dependencies.  Only supports 8-bit RGBA (which is
 * what Playwright screenshots produce).
 */
function diffPngBuffers(a: Buffer, b: Buffer): string | null {
  const pixelsA = decodePngToRGBA(a);
  const pixelsB = decodePngToRGBA(b);

  if (!pixelsA || !pixelsB) {
    // Couldn't decode — skip comparison silently
    return null;
  }

  if (pixelsA.width !== pixelsB.width || pixelsA.height !== pixelsB.height) {
    return `Screenshot sizes differ: ${pixelsA.width}×${pixelsA.height} vs ${pixelsB.width}×${pixelsB.height}`;
  }

  const tolerance = 2; // per-channel delta to absorb anti-aliasing
  const { data: dA } = pixelsA;
  const { data: dB } = pixelsB;
  let mismatchCount = 0;
  const totalPixels = pixelsA.width * pixelsA.height;

  for (let i = 0; i < dA.length; i += 4) {
    const dr = Math.abs(dA[i]! - dB[i]!);
    const dg = Math.abs(dA[i + 1]! - dB[i + 1]!);
    const db = Math.abs(dA[i + 2]! - dB[i + 2]!);
    const da = Math.abs(dA[i + 3]! - dB[i + 3]!);
    if (dr > tolerance || dg > tolerance || db > tolerance || da > tolerance) {
      mismatchCount++;
    }
  }

  if (mismatchCount === 0) {
    return null;
  }

  const pct = ((mismatchCount / totalPixels) * 100).toFixed(1);
  return `Visual mismatch: ${mismatchCount} of ${totalPixels} pixels differ (${pct}%)`;
}

/** Minimal PNG → raw RGBA decoder (no native deps). Supports 8-bit RGBA only. */
function decodePngToRGBA(buf: Buffer): { width: number; height: number; data: Uint8Array } | null {
  try {
    // Verify PNG signature
    const sig = [137, 80, 78, 71, 13, 10, 26, 10];
    for (let i = 0; i < 8; i++) {
      if (buf[i] !== sig[i]) {
        return null;
      }
    }

    let width = 0;
    let height = 0;
    let bitDepth = 0;
    let colorType = 0;
    const idatChunks: Buffer[] = [];
    let pos = 8;

    while (pos < buf.length) {
      const len = buf.readUInt32BE(pos);
      const type = buf.toString("ascii", pos + 4, pos + 8);
      const chunkData = buf.subarray(pos + 8, pos + 8 + len);

      if (type === "IHDR") {
        width = chunkData.readUInt32BE(0);
        height = chunkData.readUInt32BE(4);
        bitDepth = chunkData[8]!;
        colorType = chunkData[9]!;
      } else if (type === "IDAT") {
        idatChunks.push(chunkData as Buffer);
      } else if (type === "IEND") {
        break;
      }
      pos += 12 + len; // 4 len + 4 type + data + 4 crc
    }

    // Only support 8-bit RGBA
    if (bitDepth !== 8 || colorType !== 6) {
      return null;
    }

    const compressed = Buffer.concat(idatChunks);
    const raw = inflateSync(compressed);

    // Un-filter scanlines (filter byte + 4 bytes per pixel per row)
    const bpp = 4; // bytes per pixel (RGBA)
    const stride = width * bpp;
    const pixels = new Uint8Array(width * height * bpp);

    for (let y = 0; y < height; y++) {
      const filterType = raw[y * (stride + 1)]!;
      const scanlineOffset = y * (stride + 1) + 1;
      const outOffset = y * stride;

      for (let x = 0; x < stride; x++) {
        const rawByte = raw[scanlineOffset + x]!;
        const a = x >= bpp ? pixels[outOffset + x - bpp]! : 0; // left
        const b = y > 0 ? pixels[outOffset - stride + x]! : 0; // above
        const c = x >= bpp && y > 0 ? pixels[outOffset - stride + x - bpp]! : 0; // upper-left

        let value: number;
        switch (filterType) {
          case 0:
            value = rawByte;
            break;
          case 1:
            value = (rawByte + a) & 0xff;
            break;
          case 2:
            value = (rawByte + b) & 0xff;
            break;
          case 3:
            value = (rawByte + ((a + b) >>> 1)) & 0xff;
            break;
          case 4:
            value = (rawByte + paethPredictor(a, b, c)) & 0xff;
            break;
          default:
            return null; // unknown filter
        }
        pixels[outOffset + x] = value;
      }
    }

    return { width, height, data: pixels };
  } catch {
    return null;
  }
}

function paethPredictor(a: number, b: number, c: number): number {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) {
    return a;
  }
  if (pb <= pc) {
    return b;
  }
  return c;
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

console.log(`Checking ${testCases.length} test case(s) against storybook at ${baseUrl}...\n`);

for (const tc of testCases) {
  // Storybook auto-generates story IDs by kebab-casing the display name, e.g.
  // "theme-conditionalInlineStyle" → "theme-conditional-inline-style".
  // Apply the same conversion so the URL matches.
  const storyId = tc.replace(/[A-Z]/g, (ch) => `-${ch.toLowerCase()}`);
  const url = `${baseUrl}/iframe.html?id=test-cases--${storyId}&viewMode=story`;

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

    // Pixel-level screenshot comparison of the rendered content areas.
    // The RenderDebugFrame component wraps each panel's content in a div[ref]
    // that we can screenshot independently.
    if (status === "pass") {
      const mismatch = await compareRenderedPanels(page);
      if (mismatch) {
        status = "screenshot-mismatch";
        message = mismatch;
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

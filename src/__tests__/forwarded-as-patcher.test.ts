import { describe, it, expect, vi } from "vitest";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";
import { unlinkSync, writeFileSync } from "node:fs";
import { createModuleResolver } from "../internal/prepass/resolve-imports.js";
import { runPrepass } from "../internal/prepass/run-prepass.js";
import {
  buildForwardedAsReplacements,
  patchConsumerForwardedAs,
} from "../internal/forwarded-as-consumer-patcher.js";

// Suppress codemod logs in tests
vi.mock("../internal/logger.js", () => ({
  Logger: {
    warn: vi.fn(),
    error: vi.fn(),
    logWarnings: vi.fn(),
  },
}));

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixturesDir = join(__dirname, "fixtures", "cross-file");
const fixture = (name: string) => join(fixturesDir, name);

/** Write a temp fixture, run `fn`, then clean up regardless of outcome. */
function withTempFixture<T>(name: string, content: string, fn: (path: string) => T): T {
  const tmpPath = join(fixturesDir, name);
  writeFileSync(tmpPath, content);
  try {
    return fn(tmpPath);
  } finally {
    unlinkSync(tmpPath);
  }
}

/* ── Prepass detection ────────────────────────────────────────────────── */

describe("forwardedAs prepass detection", () => {
  const resolver = createModuleResolver();

  it("detects styled(Component) wrappers in unconverted consumer files", async () => {
    const result = await runPrepass({
      filesToTransform: [fixture("lib/flex-component.tsx")],
      consumerPaths: [fixture("consumer-styled-wrapper-as.tsx")],
      resolver,
      createExternalInterface: true,
    });

    const consumers = result.forwardedAsConsumers;
    expect(consumers.size).toBe(1);

    const entries = consumers.get(fixture("consumer-styled-wrapper-as.tsx"));
    expect(entries).toBeDefined();
    expect(entries).toHaveLength(1);
    expect(entries![0]!.localStyledName).toBe("StyledFlex");
  });

  it("detects styled(Component).attrs wrapper in unconverted consumer files", async () => {
    const result = await runPrepass({
      filesToTransform: [fixture("lib/flex-component.tsx")],
      consumerPaths: [fixture("consumer-styled-wrapper-attrs-as.tsx")],
      resolver,
      createExternalInterface: true,
    });

    const consumers = result.forwardedAsConsumers;
    expect(consumers.size).toBe(1);

    const entries = consumers.get(fixture("consumer-styled-wrapper-attrs-as.tsx"));
    expect(entries).toBeDefined();
    expect(entries).toHaveLength(1);
    expect(entries![0]!.localStyledName).toBe("StyledFlex");
  });

  it("skips consumers that are being transformed", async () => {
    const result = await runPrepass({
      filesToTransform: [
        fixture("lib/flex-component.tsx"),
        fixture("consumer-styled-wrapper-as.tsx"),
      ],
      consumerPaths: [],
      resolver,
      createExternalInterface: true,
    });

    expect(result.forwardedAsConsumers.size).toBe(0);
  });

  it("skips wrappers of components not in filesToTransform", async () => {
    const result = await runPrepass({
      filesToTransform: [fixture("consumer-styled-wrapper-as.tsx")],
      consumerPaths: [],
      resolver,
      createExternalInterface: true,
    });

    expect(result.forwardedAsConsumers.size).toBe(0);
  });

  it("does not detect wrappers when createExternalInterface is false", async () => {
    const result = await runPrepass({
      filesToTransform: [fixture("lib/flex-component.tsx")],
      consumerPaths: [fixture("consumer-styled-wrapper-as.tsx")],
      resolver,
      createExternalInterface: false,
    });

    expect(result.forwardedAsConsumers.size).toBe(0);
  });
});

/* ── buildForwardedAsReplacements ─────────────────────────────────────── */

describe("buildForwardedAsReplacements", () => {
  it("filters out consumers that were actually transformed", () => {
    const prepassConsumers = new Map([
      ["/a/consumer.tsx", [{ localStyledName: "StyledFlex" }]],
      ["/a/other.tsx", [{ localStyledName: "StyledBox" }]],
    ]);
    const transformedFiles = new Set(["/a/consumer.tsx"]);

    const result = buildForwardedAsReplacements(prepassConsumers, transformedFiles);
    expect(result.size).toBe(1);
    expect(result.has("/a/other.tsx")).toBe(true);
    expect(result.has("/a/consumer.tsx")).toBe(false);
  });

  it("returns all consumers when none were transformed", () => {
    const prepassConsumers = new Map([["/a/consumer.tsx", [{ localStyledName: "StyledFlex" }]]]);
    const transformedFiles = new Set<string>();

    const result = buildForwardedAsReplacements(prepassConsumers, transformedFiles);
    expect(result.size).toBe(1);
  });
});

/* ── patchConsumerForwardedAs ─────────────────────────────────────────── */

describe("patchConsumerForwardedAs", () => {
  it("patches JSX as= to forwardedAs= (string literal)", () => {
    const result = patchConsumerForwardedAs(fixture("consumer-styled-wrapper-as.tsx"), [
      { localStyledName: "StyledFlex" },
    ]);

    expect(result).not.toBeNull();
    expect(result).toContain('forwardedAs="span"');
    expect(result).toContain("forwardedAs={SomeComponent}");
    // Original `as=` should be replaced
    expect(result).not.toMatch(/<StyledFlex\s[^>]*\bas="/);
    expect(result).not.toMatch(/<StyledFlex\s[^>]*\bas={/);
  });

  it("patches attrs as: to forwardedAs:", () => {
    const result = patchConsumerForwardedAs(fixture("consumer-styled-wrapper-attrs-as.tsx"), [
      { localStyledName: "StyledFlex" },
    ]);

    expect(result).not.toBeNull();
    expect(result).toContain("forwardedAs:");
    expect(result).not.toMatch(/\.attrs\(\{[^}]*\bas:/);
  });

  it("skips when forwardedAs already present in JSX", () => {
    const source = [
      'import styled from "styled-components";',
      'import { Flex } from "./lib/flex-component";',
      "const StyledFlex = styled(Flex)`gap: 8px;`;",
      'export const App = () => <StyledFlex forwardedAs="span">Hello</StyledFlex>;',
    ].join("\n");

    withTempFixture("_tmp-forwarded-as-skip.tsx", source, (tmpPath) => {
      const result = patchConsumerForwardedAs(tmpPath, [{ localStyledName: "StyledFlex" }]);
      expect(result).toBeNull();
    });
  });

  it("skips when forwardedAs already present in attrs", () => {
    const source = [
      'import styled from "styled-components";',
      'import { Flex } from "./lib/flex-component";',
      'const StyledFlex = styled(Flex).attrs({ forwardedAs: "span" })`gap: 8px;`;',
      "export const App = () => <StyledFlex>Hello</StyledFlex>;",
    ].join("\n");

    withTempFixture("_tmp-forwarded-as-attrs-skip.tsx", source, (tmpPath) => {
      const result = patchConsumerForwardedAs(tmpPath, [{ localStyledName: "StyledFlex" }]);
      expect(result).toBeNull();
    });
  });

  it("handles multiple wrappers in the same file", () => {
    const source = [
      'import styled from "styled-components";',
      'import { Flex } from "./lib/flex-component";',
      'import { Box } from "./lib/box-component";',
      "const StyledFlex = styled(Flex)`gap: 8px;`;",
      "const StyledBox = styled(Box)`padding: 4px;`;",
      "export const App = () => (",
      "  <div>",
      '    <StyledFlex as="span">Hello</StyledFlex>',
      '    <StyledBox as="section">World</StyledBox>',
      "  </div>",
      ");",
    ].join("\n");

    withTempFixture("_tmp-forwarded-as-multi.tsx", source, (tmpPath) => {
      const result = patchConsumerForwardedAs(tmpPath, [
        { localStyledName: "StyledFlex" },
        { localStyledName: "StyledBox" },
      ]);

      expect(result).not.toBeNull();
      expect(result).toContain('forwardedAs="span"');
      expect(result).toContain('forwardedAs="section"');
    });
  });

  it("returns null when no changes needed", () => {
    const source = [
      'import styled from "styled-components";',
      'import { Flex } from "./lib/flex-component";',
      "const StyledFlex = styled(Flex)`gap: 8px;`;",
      "export const App = () => <StyledFlex>Hello</StyledFlex>;",
    ].join("\n");

    withTempFixture("_tmp-forwarded-as-no-change.tsx", source, (tmpPath) => {
      const result = patchConsumerForwardedAs(tmpPath, [{ localStyledName: "StyledFlex" }]);
      expect(result).toBeNull();
    });
  });

  it("returns null for non-existent file", () => {
    const result = patchConsumerForwardedAs("/does/not/exist.tsx", [
      { localStyledName: "StyledFlex" },
    ]);
    expect(result).toBeNull();
  });

  it("returns null for empty replacements", () => {
    const result = patchConsumerForwardedAs(fixture("consumer-styled-wrapper-as.tsx"), []);
    expect(result).toBeNull();
  });
});

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

// The migration plan reads real collected warnings to decide what the codemod
// cannot convert, so use the real Logger instead of the global test mock.
vi.unmock("../internal/logger.js");
import { Logger } from "../internal/logger.js";
import { analyzeMigrationPlan, formatMigrationPlan } from "../migration-plan.js";
import { defineAdapter } from "../adapter.js";

const adapter = defineAdapter({
  styleMerger: null,
  useSxProp: false,
  usePhysicalProperties: true,
  externalInterface: () => ({ styles: false, as: false, ref: false }),
  resolveValue: () => undefined,
  resolveCall: () => undefined,
  resolveSelector: () => undefined,
});

async function writeProject(files: Record<string, string>): Promise<string> {
  const tmp = await mkdtemp(join(tmpdir(), "migration-plan-"));
  await writeFile(
    join(tmp, "tsconfig.json"),
    JSON.stringify({
      compilerOptions: { jsx: "preserve", moduleResolution: "bundler" },
      include: ["src"],
    }),
  );
  for (const [relativePath, contents] of Object.entries(files)) {
    const filePath = join(tmp, relativePath);
    await mkdir(join(filePath, ".."), { recursive: true });
    await writeFile(filePath, contents);
  }
  return tmp;
}

describe("analyzeMigrationPlan", () => {
  beforeEach(() => {
    Logger._clearCollected();
    vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    vi.spyOn(process.stderr, "write").mockImplementation(() => true);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("lists only genuine blockers, ordered with consumer and export accounting", async () => {
    // Base uses an unsupported specificity hack → genuine blocker.
    // Card and Page only bail because they wrap Base (dependency-order cascade),
    // so they must NOT appear as manual-conversion files.
    const tmp = await writeProject({
      "src/Base.tsx": [
        'import styled from "styled-components";',
        "export const Base = styled.div`",
        "  & > div { color: red; }",
        "`;",
      ].join("\n"),
      "src/Card.tsx": [
        'import styled from "styled-components";',
        'import { Base } from "./Base";',
        "export const Card = styled(Base)`",
        "  background: blue;",
        "`;",
      ].join("\n"),
      "src/Page.tsx": [
        'import styled from "styled-components";',
        'import { Base } from "./Base";',
        "export const Page = styled(Base)`",
        "  background: green;",
        "`;",
      ].join("\n"),
    });

    const plan = await analyzeMigrationPlan({
      files: join(tmp, "src/**/*.tsx"),
      consumerPaths: join(tmp, "src/**/*.tsx"),
      adapter,
    });

    expect(plan.totalFiles).toBe(3);
    expect(plan.unlocksFileCount).toBe(2);
    expect(plan.manualConversionFiles).toHaveLength(1);

    const base = plan.manualConversionFiles[0]!;
    expect(base.filePath.endsWith("Base.tsx")).toBe(true);
    expect(base.order).toBe(1);
    expect(base.consumerCount).toBe(2);
    expect(base.unlocksFileCount).toBe(2);
    expect(base.importedExports).toEqual([{ exportName: "Base", consumerCount: 2 }]);
    expect(base.reasons.some((r) => r.message.includes("element selector"))).toBe(true);

    const report = formatMigrationPlan(plan);
    expect(report).toContain("1 of 3 file(s) need manual conversion");
    expect(report).toContain("unblocks 2 file(s) for automatic migration");
    expect(report).toContain("Base.tsx");
    expect(report).toContain("Convert these exports: Base (used by 2)");
  });

  it("keeps a zero-unlock dependency ahead of the high-impact file that needs it", async () => {
    // token: genuine blocker, no cascade unlocks of its own.
    // Base: genuine blocker that imports token AND is wrapped by Page, so it
    //   unblocks Page (high impact). token must still convert before Base.
    const tmp = await writeProject({
      "src/token.tsx": [
        'import styled from "styled-components";',
        "export const Token = styled.span`",
        "  & > div { color: red; }",
        "`;",
      ].join("\n"),
      "src/Base.tsx": [
        'import styled from "styled-components";',
        'import * as React from "react";',
        'import { Token } from "./token";',
        "export const Base = styled.div`",
        "  & > div { color: blue; }",
        "`;",
        "export const App = () => (",
        "  <Base>",
        "    <Token />",
        "  </Base>",
        ");",
      ].join("\n"),
      "src/Page.tsx": [
        'import styled from "styled-components";',
        'import { Base } from "./Base";',
        "export const Page = styled(Base)`",
        "  margin: 4px;",
        "`;",
      ].join("\n"),
    });

    const plan = await analyzeMigrationPlan({
      files: join(tmp, "src/**/*.tsx"),
      consumerPaths: join(tmp, "src/**/*.tsx"),
      adapter,
    });

    const order = plan.manualConversionFiles.map((f) => f.filePath);
    expect(order).toHaveLength(2);
    expect(order[0]!.endsWith("token.tsx")).toBe(true);
    expect(order[1]!.endsWith("Base.tsx")).toBe(true);

    const base = plan.manualConversionFiles.find((f) => f.filePath.endsWith("Base.tsx"))!;
    expect(base.dependsOn.some((dep) => dep.endsWith("token.tsx"))).toBe(true);
    expect(base.unlocksFileCount).toBe(1);

    // The human-readable report must not contradict the dependency order: token
    // (zero-unlock dependency) appears in the focus list before Base, not demoted
    // to the standalone section.
    const report = formatMigrationPlan(plan);
    expect(report).not.toContain("Standalone");
    expect(report.indexOf("token.tsx")).toBeLessThan(report.indexOf("Base.tsx"));
  });

  it("reports no manual conversion when everything is convertible", async () => {
    const tmp = await writeProject({
      "src/Box.tsx": [
        'import styled from "styled-components";',
        "export const Box = styled.div`",
        "  color: red;",
        "`;",
      ].join("\n"),
    });

    const plan = await analyzeMigrationPlan({
      files: join(tmp, "src/**/*.tsx"),
      consumerPaths: join(tmp, "src/**/*.tsx"),
      adapter,
    });

    expect(plan.manualConversionFiles).toHaveLength(0);
    expect(formatMigrationPlan(plan)).toContain("No manual conversion needed");
  });
});

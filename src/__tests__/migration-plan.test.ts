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
    expect(base.soleBlockerFileCount).toBe(2);
    expect(base.blockedFileCount).toBe(2);
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
    expect(base.soleBlockerFileCount).toBe(1);

    // The human-readable report must not contradict the dependency order: token
    // (zero-unlock dependency) appears in the focus list before Base, not demoted
    // to the standalone section, and Base points back to token by position.
    const report = formatMigrationPlan(plan);
    expect(report).not.toContain("Standalone");
    expect(report.indexOf("token.tsx")).toBeLessThan(report.indexOf("Base.tsx"));
    expect(report).toContain("Requires first: #1");
  });

  it("reports an out-of-scope styled base that blocks in-scope wrappers", async () => {
    // Base lives outside the `files` glob but Page (in scope) wraps it. The plan
    // must not claim success — it should surface Base as an external prerequisite.
    const tmp = await writeProject({
      "src/components/Base.tsx": [
        'import styled from "styled-components";',
        "export const Base = styled.div`",
        "  color: red;",
        "`;",
      ].join("\n"),
      "src/pages/Page.tsx": [
        'import styled from "styled-components";',
        'import { Base } from "../components/Base";',
        "export const Page = styled(Base)`",
        "  margin: 4px;",
        "`;",
      ].join("\n"),
    });

    const plan = await analyzeMigrationPlan({
      files: join(tmp, "src/pages/**/*.tsx"),
      consumerPaths: join(tmp, "src/**/*.tsx"),
      adapter,
    });

    expect(plan.manualConversionFiles).toHaveLength(1);
    const base = plan.manualConversionFiles[0]!;
    expect(base.filePath.endsWith("components/Base.tsx")).toBe(true);
    expect(base.reasons[0]!.message).toContain("Outside the analyzed files");
    expect(base.soleBlockerFileCount).toBe(1);
    expect(formatMigrationPlan(plan)).not.toContain("No manual conversion");
  });

  it("keeps a pure dependency chain ordered even when nothing unlocks auto-migration", async () => {
    // Neither file unblocks a wrapper (no styled(...) consumer), but Base imports
    // the blocked token, so the report must still order token before Base rather
    // than dumping both into the standalone "nothing depends on these" section.
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
    });

    const plan = await analyzeMigrationPlan({
      files: join(tmp, "src/**/*.tsx"),
      consumerPaths: join(tmp, "src/**/*.tsx"),
      adapter,
    });

    expect(plan.unlocksFileCount).toBe(0);
    const report = formatMigrationPlan(plan);
    expect(report).not.toContain("Standalone");
    expect(report.indexOf("token.tsx")).toBeLessThan(report.indexOf("Base.tsx"));
  });

  it("reveals a blocker masked by a cascade conflict via fixpoint passes", async () => {
    // Token is a blocker. Base = styled(Token) ALSO has its own unsupported
    // selector, but a single pass only surfaces Base's cascade bail. The fixpoint
    // must assume Token converted, re-run, and reveal Base as a blocker too —
    // and must NOT count Base as auto-unlocked by Token.
    const tmp = await writeProject({
      "src/token.tsx": [
        'import styled from "styled-components";',
        "export const Token = styled.span`",
        "  & > div { color: red; }",
        "`;",
      ].join("\n"),
      "src/Base.tsx": [
        'import styled from "styled-components";',
        'import { Token } from "./token";',
        "export const Base = styled(Token)`",
        "  & > div { color: blue; }",
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
    // Base is itself a blocker, so converting Token does not "unlock" it.
    expect(plan.unlocksFileCount).toBe(0);
    const token = plan.manualConversionFiles.find((f) => f.filePath.endsWith("token.tsx"))!;
    expect(token.soleBlockerFileCount).toBe(0);
    // Base does cascade-bail on token, so token is still in token's blocker chain.
    expect(token.blockedFileCount).toBe(1);
  });

  it("throws instead of returning a partial plan when analysis exceeds the pass cap", async () => {
    // Base = styled(Token) needs a second pass to reveal its own blocker once
    // Token is assumed converted. With a cap of 1 the fixpoint cannot stabilize,
    // so analysis must fail loudly rather than omit Base from the plan.
    const tmp = await writeProject({
      "src/token.tsx": [
        'import styled from "styled-components";',
        "export const Token = styled.span`",
        "  & > div { color: red; }",
        "`;",
      ].join("\n"),
      "src/Base.tsx": [
        'import styled from "styled-components";',
        'import { Token } from "./token";',
        "export const Base = styled(Token)`",
        "  & > div { color: blue; }",
        "`;",
      ].join("\n"),
    });

    await expect(
      analyzeMigrationPlan({
        files: join(tmp, "src/**/*.tsx"),
        consumerPaths: join(tmp, "src/**/*.tsx"),
        adapter,
        maxAnalysisPasses: 1,
      }),
    ).rejects.toThrow(/did not stabilize within 1 passes/);
  });

  it("reveals a cascade-masked blocker even when the base uses an aliased styled import", async () => {
    // Token defines its styled component via `import { styled as sc }`. Seeding it
    // as assumed-converted must use AST-aware extraction so its component name is
    // known; otherwise Base = sc2(Token) with its own unsupported selector stays
    // cascade-masked and is wrongly counted as auto-unlocked.
    const tmp = await writeProject({
      "src/token.tsx": [
        'import { styled as sc } from "styled-components";',
        "export const Token = sc.span`",
        "  & > div { color: red; }",
        "`;",
      ].join("\n"),
      "src/Base.tsx": [
        'import { styled as sc2 } from "styled-components";',
        'import { Token } from "./token";',
        "export const Base = sc2(Token)`",
        "  & > span { color: blue; }",
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
    // Base is itself a blocker, so it must not be counted as auto-unlocked.
    expect(plan.unlocksFileCount).toBe(0);
  });

  it("does not claim a sole unlock for files with multiple independent blockers", async () => {
    // Consumer wraps two separate genuine blockers, so converting either one
    // alone does not auto-convert it. It must count in each blocker's raw chain
    // impact, but as a sole unlock for neither.
    const tmp = await writeProject({
      "src/Base.tsx": [
        'import styled from "styled-components";',
        "export const Base = styled.div`",
        "  & > div { color: red; }",
        "`;",
      ].join("\n"),
      "src/Other.tsx": [
        'import styled from "styled-components";',
        "export const Other = styled.div`",
        "  & > span { color: blue; }",
        "`;",
      ].join("\n"),
      "src/Consumer.tsx": [
        'import styled from "styled-components";',
        'import { Base } from "./Base";',
        'import { Other } from "./Other";',
        "export const A = styled(Base)`",
        "  margin: 1px;",
        "`;",
        "export const B = styled(Other)`",
        "  margin: 2px;",
        "`;",
      ].join("\n"),
    });

    const plan = await analyzeMigrationPlan({
      files: join(tmp, "src/**/*.tsx"),
      consumerPaths: join(tmp, "src/**/*.tsx"),
      adapter,
    });

    const base = plan.manualConversionFiles.find((f) => f.filePath.endsWith("Base.tsx"))!;
    const other = plan.manualConversionFiles.find((f) => f.filePath.endsWith("Other.tsx"))!;
    // Consumer is in each blocker's chain, but neither alone unblocks it.
    expect(base.blockedFileCount).toBe(1);
    expect(base.soleBlockerFileCount).toBe(0);
    expect(other.blockedFileCount).toBe(1);
    expect(other.soleBlockerFileCount).toBe(0);
    // Consumer is not itself a blocker; converting both Base and Other unblocks it.
    expect(plan.manualConversionFiles.some((f) => f.filePath.endsWith("Consumer.tsx"))).toBe(false);
    expect(plan.unlocksFileCount).toBe(1);
  });

  it("reports the source export name through an aliased barrel re-export", async () => {
    // Consumer imports `Button`, which the barrel re-exports as `Base`. The plan
    // must name the export Base.tsx actually defines (`Base`), not the alias.
    const tmp = await writeProject({
      "src/Base.tsx": [
        'import styled from "styled-components";',
        "export const Base = styled.div`",
        "  & > div { color: red; }",
        "`;",
      ].join("\n"),
      "src/index.ts": 'export { Base as Button } from "./Base";\n',
      "src/Consumer.tsx": [
        'import styled from "styled-components";',
        'import { Button } from "./index";',
        "export const X = styled(Button)`",
        "  margin: 1px;",
        "`;",
      ].join("\n"),
    });

    const plan = await analyzeMigrationPlan({
      files: join(tmp, "src/**/*.tsx"),
      consumerPaths: join(tmp, "src/**/*.tsx"),
      adapter,
    });

    const base = plan.manualConversionFiles.find((f) => f.filePath.endsWith("Base.tsx"))!;
    expect(base.importedExports).toEqual([{ exportName: "Base", consumerCount: 1 }]);
  });

  it("ignores type-only imports when counting consumers", async () => {
    // Base is a blocker; Consumer only imports a type from it, so Base has no
    // runtime consumer and the type import must not inflate its consumer count.
    const tmp = await writeProject({
      "src/Base.tsx": [
        'import styled from "styled-components";',
        "export const Base = styled.div`",
        "  & > div { color: red; }",
        "`;",
        "export type BaseProps = { tone: string };",
      ].join("\n"),
      "src/Consumer.tsx": [
        'import type { BaseProps } from "./Base";',
        'export const value: BaseProps = { tone: "a" };',
      ].join("\n"),
    });

    const plan = await analyzeMigrationPlan({
      files: join(tmp, "src/**/*.tsx"),
      consumerPaths: join(tmp, "src/**/*.tsx"),
      adapter,
    });

    const base = plan.manualConversionFiles.find((f) => f.filePath.endsWith("Base.tsx"))!;
    expect(base.consumerCount).toBe(0);
  });

  it("restores the global logger so analysis warnings don't leak", async () => {
    const tmp = await writeProject({
      "src/Base.tsx": [
        'import styled from "styled-components";',
        "export const Base = styled.div`",
        "  & > div { color: red; }",
        "`;",
      ].join("\n"),
    });

    await analyzeMigrationPlan({
      files: join(tmp, "src/**/*.tsx"),
      consumerPaths: join(tmp, "src/**/*.tsx"),
      adapter,
    });

    // beforeEach cleared the logger, so after analysis it must be empty again.
    expect(Logger.createReport().getWarnings()).toHaveLength(0);
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

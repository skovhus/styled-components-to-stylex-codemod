import { describe, it, expect, vi } from "vitest";
import { mkdtemp, copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { format } from "oxfmt";
import { runTransform } from "../run.js";
import {
  runTransform as runTransformFromIndex,
  defineAdapter as defineAdapterFromIndex,
} from "../index.js";
import type { AdapterInput } from "../adapter.js";
import { fixtureAdapter } from "./fixture-adapters.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const testCasesDir = join(__dirname, "..", "..", "test-cases");

async function normalizeCode(code: string): Promise<string> {
  const { code: formatted } = await format("test.tsx", code);
  return formatted.replace(/\n{3,}/g, "\n\n").trim();
}

async function runAutoSxWrapperFixture(args: {
  tmpPrefix: string;
  componentLines: string[];
  importLine: string;
  bodyRuleLines: string[];
  externalInterface?: AdapterInput["externalInterface"];
  useSxProp?: boolean;
  consumerPaths?: string | string[] | null;
  dryRun?: boolean;
  print?: boolean;
}): Promise<{
  result: Awaited<ReturnType<typeof runTransform>>;
  container: string;
  consumer: string;
}> {
  const tmp = await mkdtemp(join(tmpdir(), args.tmpPrefix));
  await mkdir(join(tmp, "src/components"), { recursive: true });
  await mkdir(join(tmp, "src/views/Debug"), { recursive: true });

  await writeFile(
    join(tmp, "tsconfig.json"),
    JSON.stringify(
      {
        compilerOptions: {
          jsx: "preserve",
          moduleResolution: "bundler",
        },
        include: ["src"],
      },
      null,
      2,
    ),
  );

  await writeFile(
    join(tmp, "src/components/ContentViewContainer.tsx"),
    args.componentLines.join("\n"),
  );
  await writeFile(
    join(tmp, "src/views/Debug/Repro.tsx"),
    [
      'import styled from "styled-components";',
      args.importLine,
      "",
      "const Body = styled(ContentViewContainer)`",
      ...args.bodyRuleLines,
      "`;",
      "",
      "export function App() {",
      "  return <Body />;",
      "}",
      "",
    ].join("\n"),
  );

  const adapter = defineAdapterFromIndex({
    useSxProp: args.useSxProp ?? true,
    externalInterface: args.externalInterface ?? "auto",
    styleMerger: {
      functionName: "mergedSx",
      importSource: { kind: "specifier", value: "./mergedSx" },
    },
    resolveValue: () => undefined,
    resolveCall: () => undefined,
    resolveSelector: () => undefined,
  });

  const result = await runTransform({
    files: join(tmp, "src/**/*.tsx"),
    consumerPaths:
      args.consumerPaths === undefined ? join(tmp, "src/**/*.tsx") : args.consumerPaths,
    adapter,
    dryRun: args.dryRun ?? false,
    print: args.print ?? false,
    parser: "tsx",
    silent: true,
  });

  return {
    result,
    container: await readFile(join(tmp, "src/components/ContentViewContainer.tsx"), "utf-8"),
    consumer: await readFile(join(tmp, "src/views/Debug/Repro.tsx"), "utf-8"),
  };
}

function expectAutoSxWrapperResult(args: {
  result: Awaited<ReturnType<typeof runTransform>>;
  container: string;
  consumer: string;
}): void {
  expect(args.result.errors).toBe(0);
  expect(args.result.transformed).toBe(2);
  expect(args.result.skipped).toBe(0);
  expect(args.container).toContain("sx?: stylex.StyleXStyles");
  expect(args.consumer).toContain("return <ContentViewContainer sx={styles.body} />");
  expect(args.consumer).not.toContain("stylex.props(styles.body)");
}

describe("index.ts barrel exports", () => {
  it("re-exports runTransform and defineAdapter from the package entry point", () => {
    expect(runTransformFromIndex).toBe(runTransform);
    expect(typeof defineAdapterFromIndex).toBe("function");
  });
});

describe("runTransform (e2e)", () => {
  it("transforms a fixture in a temp folder and matches the .output.tsx file", async () => {
    const fixtureName = "cssVariable-basic";

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
      consumerPaths: null,
      adapter: fixtureAdapter,
      dryRun: false,
      print: false,
      parser: "tsx",
      silent: true,
    });

    expect(result.errors).toBe(0);
    expect(result.transformed).toBe(1);

    const actual = await readFile(targetFile, "utf-8");
    const expected = await readFile(outputSrc, "utf-8");

    expect(await normalizeCode(actual)).toBe(await normalizeCode(expected));
  });

  it("uses sx for wrappers of components made sx-aware by the same run", async () => {
    expectAutoSxWrapperResult(
      await runAutoSxWrapperFixture({
        tmpPrefix: "styledx-run-sx-aware-",
        componentLines: [
          'import styled from "styled-components";',
          "",
          "export const ContentViewContainer = styled.div`",
          "  display: flex;",
          "  flex-grow: 1;",
          "`;",
          "",
        ],
        importLine: 'import { ContentViewContainer } from "../../components/ContentViewContainer";',
        bodyRuleLines: [
          "  display: grid;",
          "  grid-template-columns: minmax(280px, 320px) minmax(0, 1fr);",
          "  gap: 16px;",
          "  flex: 1 1 auto;",
          "  min-height: 0;",
        ],
      }),
    );
  });

  it("uses sx for wrappers of default-exported components made sx-aware by the same run", async () => {
    expectAutoSxWrapperResult(
      await runAutoSxWrapperFixture({
        tmpPrefix: "styledx-run-sx-aware-default-",
        componentLines: [
          'import styled from "styled-components";',
          "",
          "const ContentViewContainer = styled.div`",
          "  display: flex;",
          "  flex-grow: 1;",
          "`;",
          "",
          "export default ContentViewContainer;",
          "",
        ],
        importLine: 'import ContentViewContainer from "../../components/ContentViewContainer";',
        bodyRuleLines: ["  display: grid;", "  gap: 16px;"],
      }),
    );
  });

  it("does not infer sx for wrappers when the base file bails in the same run", async () => {
    const { result, container, consumer } = await runAutoSxWrapperFixture({
      tmpPrefix: "styledx-run-sx-aware-bailed-base-",
      componentLines: [
        'import styled from "styled-components";',
        "",
        "export const ContentViewContainer = styled.div`",
        "  display: flex;",
        "  * {",
        "    color: red;",
        "  }",
        "`;",
        "",
      ],
      importLine: 'import { ContentViewContainer } from "../../components/ContentViewContainer";',
      bodyRuleLines: ["  display: grid;", "  gap: 16px;"],
    });

    expect(result.errors).toBe(0);
    expect(result.transformed).toBe(0);
    expect(result.skipped).toBe(2);
    expect(container).not.toContain("sx?: stylex.StyleXStyles");
    expect(consumer).toContain("const Body = styled(ContentViewContainer)`");
    expect(consumer).not.toContain("sx={styles.body}");
    expect(consumer).not.toContain("stylex.props(styles.body)");
  });

  it("does not infer sx for plain components in files transformed by the same run", async () => {
    const { result, container, consumer } = await runAutoSxWrapperFixture({
      tmpPrefix: "styledx-run-plain-component-no-sx-",
      componentLines: [
        'import * as React from "react";',
        'import styled from "styled-components";',
        "",
        "type ContentViewContainerProps = {",
        "  className?: string;",
        "  style?: React.CSSProperties;",
        "};",
        "",
        "export function ContentViewContainer(props: ContentViewContainerProps) {",
        "  const { className, style } = props;",
        "  return <section className={className} style={style} />;",
        "}",
        "",
        "export const ConvertedSibling = styled.div`",
        "  display: flex;",
        "`;",
        "",
      ],
      importLine: 'import { ContentViewContainer } from "../../components/ContentViewContainer";',
      bodyRuleLines: ["  display: grid;", "  gap: 16px;"],
    });

    expect(result.errors).toBe(0);
    expect(result.transformed).toBe(2);
    expect(result.skipped).toBe(0);
    expect(container).toContain("function ContentViewContainer(props: ContentViewContainerProps)");
    expect(container).not.toContain("sx?: stylex.StyleXStyles");
    expect(consumer).toContain("{...mergedSx(styles.body)}");
    expect(consumer).not.toContain("sx={styles.body}");
  });

  it("does not false-bail same-run wrappers when sx prop emission is disabled", async () => {
    const { result, consumer } = await runAutoSxWrapperFixture({
      tmpPrefix: "styledx-run-sequential-manual-interface-",
      componentLines: [
        'import styled from "styled-components";',
        "",
        "export const ContentViewContainer = styled.div`",
        "  display: flex;",
        "  flex-grow: 1;",
        "`;",
        "",
      ],
      importLine: 'import { ContentViewContainer } from "../../components/ContentViewContainer";',
      bodyRuleLines: ["  display: grid;", "  gap: 16px;"],
      externalInterface: () => ({ styles: true, as: false, ref: false }),
      useSxProp: false,
      consumerPaths: null,
    });

    expect(result.errors).toBe(0);
    expect(result.transformed).toBe(2);
    expect(result.skipped).toBe(0);
    expect(consumer).toContain("{...stylex.props(styles.body)}");
    expect(consumer).not.toContain("sx={styles.body}");
  });

  it("does not leak jscodeshift worker listeners on runs with more than ten files", async () => {
    const tmp = await mkdtemp(join(tmpdir(), "styledx-run-many-files-"));
    await mkdir(join(tmp, "src"), { recursive: true });
    for (let i = 0; i < 12; i += 1) {
      await writeFile(join(tmp, "src", `File${i}.tsx`), `export const value${i} = ${i};\n`);
    }

    const warnings: Error[] = [];
    const onWarning = (warning: Error) => warnings.push(warning);
    process.on("warning", onWarning);
    try {
      const result = await runTransform({
        files: join(tmp, "src/**/*.tsx"),
        consumerPaths: null,
        adapter: defineAdapterFromIndex({
          useSxProp: false,
          externalInterface: () => ({ styles: false, as: false, ref: false }),
          styleMerger: null,
          resolveValue: () => undefined,
          resolveCall: () => undefined,
          resolveSelector: () => undefined,
        }),
        dryRun: true,
        print: false,
        parser: "tsx",
        silent: true,
      });

      expect(result.errors).toBe(0);
    } finally {
      process.off("warning", onWarning);
    }

    expect(warnings.map((warning) => warning.name)).not.toContain("MaxListenersExceededWarning");
  });

  it("prints dry-run output that matches same-run sx-aware wrapper emission", async () => {
    const printedChunks: string[] = [];
    const writeSpy = vi
      .spyOn(process.stdout, "write")
      .mockImplementation((chunk: string | Uint8Array) => {
        printedChunks.push(String(chunk));
        return true;
      });

    let result: Awaited<ReturnType<typeof runTransform>>;
    let consumer: string;
    try {
      const fixture = await runAutoSxWrapperFixture({
        tmpPrefix: "styledx-run-dry-print-sx-aware-",
        componentLines: [
          'import styled from "styled-components";',
          "",
          "export const ContentViewContainer = styled.div`",
          "  display: flex;",
          "  flex-grow: 1;",
          "`;",
          "",
        ],
        importLine: 'import { ContentViewContainer } from "../../components/ContentViewContainer";',
        bodyRuleLines: ["  display: grid;", "  gap: 16px;"],
        externalInterface: () => ({ styles: true, as: false, ref: false }),
        consumerPaths: null,
        dryRun: true,
        print: true,
      });
      result = fixture.result;
      consumer = fixture.consumer;
    } finally {
      writeSpy.mockRestore();
    }

    expect(result.errors).toBe(0);
    expect(result.transformed).toBe(2);
    expect(consumer).toContain("const Body = styled(ContentViewContainer)`");
    expect(printedChunks.join("")).toContain("return <ContentViewContainer sx={styles.body} />");
    expect(printedChunks.join("")).not.toContain("stylex.props(styles.body)");
  });
});

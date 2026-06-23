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
  wrappedName?: string;
  bodyRuleLines: string[];
  externalInterface?: AdapterInput["externalInterface"];
  useSxProp?: boolean;
  consumerPaths?: string | string[] | null;
  dryRun?: boolean;
  print?: boolean;
  appReturn?: string;
  exportStyled?: boolean;
  additionalFiles?: Array<{ relativePath: string; lines: string[] }>;
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
  for (const file of args.additionalFiles ?? []) {
    const filePath = join(tmp, file.relativePath);
    await mkdir(dirname(filePath), { recursive: true });
    await writeFile(filePath, file.lines.join("\n"));
  }
  await writeFile(
    join(tmp, "src/views/Debug/Repro.tsx"),
    [
      'import styled from "styled-components";',
      args.importLine,
      "",
      `${args.exportStyled ? "export " : ""}const Body = styled(${args.wrappedName ?? "ContentViewContainer"})\``,
      ...args.bodyRuleLines,
      "`;",
      "",
      "export function App() {",
      `  return ${args.appReturn ?? "<Body />"};`,
      "}",
      "",
    ].join("\n"),
  );

  const adapter = defineAdapterFromIndex({
    useSxProp: args.useSxProp ?? true,
    usePhysicalProperties: true,
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
  wrappedName?: string;
  transformed?: number;
  skipped?: number;
  containerSxText?: string;
}): void {
  expect(args.result.errors).toBe(0);
  expect(args.result.transformed).toBe(args.transformed ?? 2);
  expect(args.result.skipped).toBe(args.skipped ?? 0);
  expect(args.container).toContain(args.containerSxText ?? "sx?: stylex.StyleXStyles");
  expect(args.consumer).toContain(
    `return <${args.wrappedName ?? "ContentViewContainer"} sx={styles.body} />`,
  );
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

  it("uses sx for wrappers of static member components made sx-aware by the same run", async () => {
    const { result, consumer } = await runAutoSxWrapperFixture({
      tmpPrefix: "styledx-run-static-member-sx-aware-",
      componentLines: [
        'import * as React from "react";',
        'import * as stylex from "@stylexjs/stylex";',
        "",
        "type SelectProps = React.PropsWithChildren<{ value?: string }>;",
        "type SelectOptionProps = React.PropsWithChildren<{",
        "  value: string;",
        "  sx?: stylex.StyleXStyles;",
        "}>;",
        "",
        "const SelectBase = (props: SelectProps) => <div>{props.children}</div>;",
        "const SelectOption = (props: SelectOptionProps) => <div sx={props.sx}>{props.children}</div>;",
        "const MobileSelectOption = (props: SelectOptionProps) => <option>{props.children}</option>;",
        "",
        "const CustomSelect = SelectBase as typeof SelectBase & { Option: typeof SelectOption };",
        "CustomSelect.Option = SelectOption;",
        "const MobileSelect = SelectBase as typeof SelectBase & { Option: typeof MobileSelectOption };",
        "MobileSelect.Option = MobileSelectOption;",
        "",
        "export const ContentViewContainer = true ? MobileSelect : CustomSelect;",
      ],
      wrappedName: "ContentViewContainer.Option",
      importLine: 'import { ContentViewContainer } from "../../components/ContentViewContainer";',
      bodyRuleLines: ["  color: red;"],
      appReturn: '<Body value="home">Home</Body>',
    });

    expect(result.errors).toBe(0);
    expect(consumer).toContain('<ContentViewContainer.Option value="home" sx={styles.body}>');
    expect(consumer).not.toContain("stylex.props(styles.body)");
  });

  it("bails on sx-aware static member wrappers that still depend on styled-components", async () => {
    const { result, consumer } = await runAutoSxWrapperFixture({
      tmpPrefix: "styledx-run-static-member-styled-dependency-",
      componentLines: [
        'import * as React from "react";',
        'import * as stylex from "@stylexjs/stylex";',
        'import styled from "styled-components";',
        "",
        "type SelectProps = React.PropsWithChildren<Record<string, never>>;",
        "type SelectOptionProps = React.PropsWithChildren<{",
        "  value: string;",
        "  sx?: stylex.StyleXStyles;",
        "}>;",
        "",
        "const SelectBase = (props: SelectProps) => <div>{props.children}</div>;",
        "const StyledOptionRoot = styled.div`",
        "  max-width: 300px;",
        "",
        "  span {",
        "    color: red;",
        "  }",
        "`;",
        "const SelectOption = (props: SelectOptionProps) => (",
        "  <StyledOptionRoot sx={props.sx}>{props.children}</StyledOptionRoot>",
        ");",
        "",
        "const CustomSelect = SelectBase as typeof SelectBase & { Option: typeof SelectOption };",
        "CustomSelect.Option = SelectOption;",
        "",
        "export const ContentViewContainer = CustomSelect;",
      ],
      wrappedName: "ContentViewContainer.Option",
      importLine: 'import { ContentViewContainer } from "../../components/ContentViewContainer";',
      bodyRuleLines: ["  max-width: 100%;"],
      appReturn: '<Body value="home">Home</Body>',
    });

    expect(result.errors).toBe(0);
    expect(result.skipped).toBe(2);
    expect(consumer).toContain("const Body = styled(ContentViewContainer.Option)`");
    expect(consumer).not.toContain("sx={styles.body}");
  });

  it("bails on static member wrappers whose StyleX root hides a styled-dependent member", async () => {
    const { result, consumer } = await runAutoSxWrapperFixture({
      tmpPrefix: "styledx-run-static-member-stylex-root-",
      componentLines: [
        'import * as React from "react";',
        'import * as stylex from "@stylexjs/stylex";',
        'import styled from "styled-components";',
        "",
        'const baseStyles = stylex.create({ root: { color: "blue" } });',
        "",
        "type SelectProps = React.PropsWithChildren<Record<string, never>>;",
        "type SelectOptionProps = React.PropsWithChildren<{",
        "  value: string;",
        "  sx?: stylex.StyleXStyles;",
        "}>;",
        "",
        "const SelectBase = (props: SelectProps) => (",
        "  <div {...stylex.props(baseStyles.root)}>{props.children}</div>",
        ");",
        "const StyledOptionRoot = styled.div`",
        "  max-width: 300px;",
        "",
        "  span {",
        "    color: red;",
        "  }",
        "`;",
        "const SelectOption = (props: SelectOptionProps) => (",
        "  <StyledOptionRoot sx={props.sx}>{props.children}</StyledOptionRoot>",
        ");",
        "",
        "const CustomSelect = SelectBase as typeof SelectBase & { Option: typeof SelectOption };",
        "CustomSelect.Option = SelectOption;",
        "",
        "export const ContentViewContainer = CustomSelect;",
      ],
      wrappedName: "ContentViewContainer.Option",
      importLine: 'import { ContentViewContainer } from "../../components/ContentViewContainer";',
      bodyRuleLines: ["  max-width: 100%;"],
      appReturn: '<Body value="home">Home</Body>',
    });

    expect(result.errors).toBe(0);
    expect(result.skipped).toBe(2);
    expect(consumer).toContain("const Body = styled(ContentViewContainer.Option)`");
    expect(consumer).not.toContain("sx={styles.body}");
  });

  it("bails on static member wrappers whose StyleX root assigns an imported styled-dependent member", async () => {
    const { result, consumer } = await runAutoSxWrapperFixture({
      tmpPrefix: "styledx-run-static-member-imported-styled-dependency-",
      componentLines: [
        'import * as React from "react";',
        'import * as stylex from "@stylexjs/stylex";',
        'import { SelectOption } from "./SelectOption";',
        "",
        'const baseStyles = stylex.create({ root: { color: "blue" } });',
        "",
        "type SelectProps = React.PropsWithChildren<Record<string, never>>;",
        "",
        "const SelectBase = (props: SelectProps) => (",
        "  <div {...stylex.props(baseStyles.root)}>{props.children}</div>",
        ");",
        "",
        "const CustomSelect = SelectBase as typeof SelectBase & { Option: typeof SelectOption };",
        "CustomSelect.Option = SelectOption;",
        "",
        "export const ContentViewContainer = CustomSelect;",
      ],
      additionalFiles: [
        {
          relativePath: "src/components/SelectOption.tsx",
          lines: [
            'import * as React from "react";',
            'import * as stylex from "@stylexjs/stylex";',
            'import styled from "styled-components";',
            "",
            "type SelectOptionProps = React.PropsWithChildren<{",
            "  value: string;",
            "  sx?: stylex.StyleXStyles;",
            "}>;",
            "",
            "const StyledOptionRoot = styled.div`",
            "  max-width: 300px;",
            "",
            "  span {",
            "    color: red;",
            "  }",
            "`;",
            "",
            "export const SelectOption = (props: SelectOptionProps) => (",
            "  <StyledOptionRoot sx={props.sx}>{props.children}</StyledOptionRoot>",
            ");",
          ],
        },
      ],
      wrappedName: "ContentViewContainer.Option",
      importLine: 'import { ContentViewContainer } from "../../components/ContentViewContainer";',
      bodyRuleLines: ["  max-width: 100%;"],
      appReturn: '<Body value="home">Home</Body>',
    });

    expect(result.errors).toBe(0);
    expect(result.skipped).toBe(3);
    expect(consumer).toContain("const Body = styled(ContentViewContainer.Option)`");
    expect(consumer).not.toContain("sx={styles.body}");
  });

  it("bails on static member wrappers whose StyleX root re-exports an imported styled-dependent member", async () => {
    const { result, consumer } = await runAutoSxWrapperFixture({
      tmpPrefix: "styledx-run-static-member-imported-member-dependency-",
      componentLines: [
        'import * as React from "react";',
        'import * as stylex from "@stylexjs/stylex";',
        'import { InnerSelect } from "./InnerSelect";',
        "",
        'const baseStyles = stylex.create({ root: { color: "blue" } });',
        "",
        "type SelectProps = React.PropsWithChildren<Record<string, never>>;",
        "",
        "const SelectBase = (props: SelectProps) => (",
        "  <div {...stylex.props(baseStyles.root)}>{props.children}</div>",
        ");",
        "",
        "const CustomSelect = SelectBase as typeof SelectBase & { Option: typeof InnerSelect.Option };",
        "CustomSelect.Option = InnerSelect.Option;",
        "",
        "export const ContentViewContainer = CustomSelect;",
      ],
      additionalFiles: [
        {
          relativePath: "src/components/InnerSelect.tsx",
          lines: [
            'import * as React from "react";',
            'import * as stylex from "@stylexjs/stylex";',
            'import styled from "styled-components";',
            "",
            'const baseStyles = stylex.create({ root: { color: "green" } });',
            "",
            "type SelectProps = React.PropsWithChildren<Record<string, never>>;",
            "type SelectOptionProps = React.PropsWithChildren<{",
            "  value: string;",
            "  sx?: stylex.StyleXStyles;",
            "}>;",
            "",
            "const SelectBase = (props: SelectProps) => (",
            "  <div {...stylex.props(baseStyles.root)}>{props.children}</div>",
            ");",
            "const StyledOptionRoot = styled.div`",
            "  max-width: 300px;",
            "",
            "  span {",
            "    color: red;",
            "  }",
            "`;",
            "const SelectOption = (props: SelectOptionProps) => (",
            "  <StyledOptionRoot sx={props.sx}>{props.children}</StyledOptionRoot>",
            ");",
            "",
            "const CustomSelect = SelectBase as typeof SelectBase & { Option: typeof SelectOption };",
            "CustomSelect.Option = SelectOption;",
            "",
            "export const InnerSelect = CustomSelect;",
          ],
        },
      ],
      wrappedName: "ContentViewContainer.Option",
      importLine: 'import { ContentViewContainer } from "../../components/ContentViewContainer";',
      bodyRuleLines: ["  max-width: 100%;"],
      appReturn: '<Body value="home">Home</Body>',
    });

    expect(result.errors).toBe(0);
    expect(result.skipped).toBe(3);
    expect(consumer).toContain("const Body = styled(ContentViewContainer.Option)`");
    expect(consumer).not.toContain("sx={styles.body}");
  });

  it("expands sx-excluded logical properties for sx-aware wrappers", async () => {
    const { result, consumer } = await runAutoSxWrapperFixture({
      tmpPrefix: "styledx-run-sx-without-",
      componentLines: [
        'import * as React from "react";',
        'import * as stylex from "@stylexjs/stylex";',
        "",
        "export type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {",
        "  size?: 'small' | 'normal';",
        "  variant?: 'borderless' | 'primary';",
        "  sx?: stylex.StyleXStylesWithout<{",
        "    paddingBlock?: string | number | null;",
        "    paddingInline?: string | number | null;",
        "  }>;",
        "};",
        "",
        "export function ContentViewContainer(props: ButtonProps) {",
        "  return <button />;",
        "}",
        "",
      ],
      importLine: 'import { ContentViewContainer } from "../../components/ContentViewContainer";',
      bodyRuleLines: ["  padding: 0 6px;", "  margin-left: -6px;"],
    });

    expect(result.errors).toBe(0);
    expect(consumer).toContain("paddingTop: 0");
    expect(consumer).toContain("paddingRight: 6");
    expect(consumer).toContain("paddingBottom: 0");
    expect(consumer).toContain("paddingLeft: 6");
    expect(consumer).not.toContain("paddingBlock");
    expect(consumer).not.toContain("paddingInline");
    expect(consumer).toContain("sx={styles.body}");
  });

  it("does not infer onlyIcon narrowing for sx-aware wrappers that render children", async () => {
    const { result, consumer } = await runAutoSxWrapperFixture({
      tmpPrefix: "styledx-run-only-icon-",
      componentLines: [
        'import * as React from "react";',
        'import * as stylex from "@stylexjs/stylex";',
        "",
        "export type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {",
        "  sx?: stylex.StyleXStyles;",
        "} & (",
        "  | { onlyIcon?: false; ['aria-label']?: string }",
        "  | { onlyIcon: true; ['aria-label']: string }",
        ");",
        "",
        "export function Button(props: ButtonProps) {",
        "  return <button />;",
        "}",
        "",
      ],
      importLine: 'import { Button } from "../../components/ContentViewContainer";',
      wrappedName: "Button",
      bodyRuleLines: ["  margin-left: -6px;"],
      appReturn: "<><Body>Open</Body><Body>Again</Body></>",
      exportStyled: true,
    });

    expect(result.errors).toBe(0);
    expect(consumer).not.toContain("onlyIcon?: false");
    expect(consumer).not.toContain('"onlyIcon"');
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

  it("uses sx for aliased default-exported function components with sx props", async () => {
    expectAutoSxWrapperResult({
      ...(await runAutoSxWrapperFixture({
        tmpPrefix: "styledx-run-sx-aware-default-function-alias-",
        componentLines: [
          'import * as React from "react";',
          'import type { StyleXStyles } from "@stylexjs/stylex";',
          "",
          "export default function ContentViewContainer(props: {",
          "  sx?: StyleXStyles;",
          "  children?: React.ReactNode;",
          "}) {",
          "  return <section>{props.children}</section>;",
          "}",
          "",
        ],
        importLine: 'import Base from "../../components/ContentViewContainer";',
        wrappedName: "Base",
        bodyRuleLines: ["  display: grid;", "  gap: 16px;"],
      })),
      wrappedName: "Base",
      transformed: 1,
      skipped: 1,
      containerSxText: "sx?: StyleXStyles",
    });
  });

  it("uses sx for aliased default-exported variable components with sx props", async () => {
    expectAutoSxWrapperResult({
      ...(await runAutoSxWrapperFixture({
        tmpPrefix: "styledx-run-sx-aware-default-variable-alias-",
        componentLines: [
          'import * as React from "react";',
          'import type { StyleXStyles } from "@stylexjs/stylex";',
          "",
          "const ContentViewContainer = (props: {",
          "  sx?: StyleXStyles;",
          "  children?: React.ReactNode;",
          "}) => {",
          "  return <section>{props.children}</section>;",
          "};",
          "",
          "export default ContentViewContainer;",
          "",
        ],
        importLine: 'import Base from "../../components/ContentViewContainer";',
        wrappedName: "Base",
        bodyRuleLines: ["  display: grid;", "  gap: 16px;"],
      })),
      wrappedName: "Base",
      transformed: 1,
      skipped: 1,
      containerSxText: "sx?: StyleXStyles",
    });
  });

  it("uses sx for wrappers of components with imported StyleXStyles props", async () => {
    const { result, container, consumer } = await runAutoSxWrapperFixture({
      tmpPrefix: "styledx-run-imported-sx-type-",
      componentLines: [
        'import * as React from "react";',
        'import type { StyleXStyles } from "@stylexjs/stylex";',
        "",
        "type ContentViewContainerProps = {",
        "  sx?: StyleXStyles;",
        "  children?: React.ReactNode;",
        "};",
        "",
        "export function ContentViewContainer(props: ContentViewContainerProps) {",
        "  return <section>{props.children}</section>;",
        "}",
        "",
      ],
      importLine: 'import { ContentViewContainer } from "../../components/ContentViewContainer";',
      bodyRuleLines: ["  display: grid;", "  gap: 16px;"],
    });

    expect(result.errors).toBe(0);
    expect(container).toContain("sx?: StyleXStyles");
    expect(container).not.toContain("sx?: stylex.StyleXStyles");
    expect(consumer).toContain("return <ContentViewContainer sx={styles.body} />");
    expect(consumer).not.toContain("stylex.props(styles.body)");
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
    expect(consumer).toContain("{...stylex.props(styles.body)}");
    expect(consumer).not.toContain("sx={styles.body}");
  });

  it("auto external interface forwards element props without public className/style/sx", async () => {
    const tmp = await mkdtemp(join(tmpdir(), "styledx-run-auto-element-props-"));
    await mkdir(join(tmp, "src/components"), { recursive: true });
    await mkdir(join(tmp, "src/views"), { recursive: true });
    await writeFile(
      join(tmp, "tsconfig.json"),
      JSON.stringify({ compilerOptions: { jsx: "preserve", moduleResolution: "bundler" } }),
    );
    await writeFile(
      join(tmp, "src/components/ElementOnly.tsx"),
      [
        'import styled from "styled-components";',
        "",
        "export const ElementOnly = styled.div`",
        "  background-color: papayawhip;",
        "  padding: 8px;",
        "`;",
        "",
      ].join("\n"),
    );
    await writeFile(
      join(tmp, "src/views/App.tsx"),
      [
        'import { ElementOnly } from "../components/ElementOnly";',
        "",
        "export function App() {",
        '  return <ElementOnly onClick={() => undefined} aria-label="Element only">Click</ElementOnly>;',
        "}",
        "",
      ].join("\n"),
    );

    const result = await runTransform({
      files: join(tmp, "src/components/**/*.tsx"),
      consumerPaths: join(tmp, "src/**/*.tsx"),
      adapter: defineAdapterFromIndex({
        useSxProp: true,
        usePhysicalProperties: true,
        externalInterface: "auto",
        styleMerger: {
          functionName: "mergedSx",
          importSource: { kind: "specifier", value: "./mergedSx" },
        },
        resolveValue: () => undefined,
        resolveCall: () => undefined,
        resolveSelector: () => undefined,
      }),
      dryRun: false,
      print: false,
      parser: "tsx",
      silent: true,
    });

    const component = await readFile(join(tmp, "src/components/ElementOnly.tsx"), "utf-8");
    expect(result.errors).toBe(0);
    expect(result.transformed).toBe(1);
    expect(component).toContain('Omit<React.ComponentProps<"div">, "className" | "style" | "sx">');
    expect(component).toContain("<div {...props} sx={styles.elementOnly} />");
    expect(component).not.toContain("sx?: stylex.StyleXStyles");
    expect(component).not.toContain("mergedSx");
    expect(component).not.toContain("const { className");
    expect(component).not.toContain("const { style");
  });

  it("auto external interface keeps className/style merging for restyled typed components", async () => {
    const tmp = await mkdtemp(join(tmpdir(), "styledx-run-auto-restyled-typed-"));
    await mkdir(join(tmp, "src/components"), { recursive: true });
    await mkdir(join(tmp, "src/views"), { recursive: true });
    await writeFile(
      join(tmp, "tsconfig.json"),
      JSON.stringify({ compilerOptions: { jsx: "preserve", moduleResolution: "bundler" } }),
    );
    await writeFile(
      join(tmp, "src/components/Button.tsx"),
      [
        'import styled from "styled-components";',
        "",
        "export const Button = styled.button<{ tone?: 'primary' | 'secondary' }>`",
        "  color: ${(props) => (props.tone === 'primary' ? 'blue' : 'gray')};",
        "`;",
        "",
      ].join("\n"),
    );
    await writeFile(
      join(tmp, "src/views/App.tsx"),
      [
        'import styled from "styled-components";',
        'import { Button } from "../components/Button";',
        "",
        "const FancyButton = styled(Button)`",
        "  font-weight: bold;",
        "`;",
        "",
        "export function App() {",
        '  return <FancyButton tone="primary">Restyled</FancyButton>;',
        "}",
        "",
      ].join("\n"),
    );

    const result = await runTransform({
      files: join(tmp, "src/components/**/*.tsx"),
      consumerPaths: join(tmp, "src/**/*.tsx"),
      adapter: defineAdapterFromIndex({
        useSxProp: true,
        usePhysicalProperties: true,
        externalInterface: "auto",
        styleMerger: {
          functionName: "mergedSx",
          importSource: { kind: "specifier", value: "./mergedSx" },
        },
        resolveValue: () => undefined,
        resolveCall: () => undefined,
        resolveSelector: () => undefined,
      }),
      dryRun: false,
      print: false,
      parser: "tsx",
      silent: true,
    });

    const component = await readFile(join(tmp, "src/components/Button.tsx"), "utf-8");
    expect(result.errors).toBe(0);
    expect(result.transformed).toBe(1);
    expect(component).toContain('React.ComponentProps<"button">');
    expect(component).toContain("const {\n    className,");
    expect(component).toContain("style,");
    expect(component).toContain("mergedSx");
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
          usePhysicalProperties: true,
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

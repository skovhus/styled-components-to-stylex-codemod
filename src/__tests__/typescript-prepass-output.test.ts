import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import jscodeshift from "jscodeshift";
import { describe, expect, it } from "vitest";

import { fixtureAdapter } from "./fixture-adapters.js";
import { analyzeTypeScriptProgram } from "../internal/prepass/typescript-analysis.js";
import { transformWithWarnings } from "../transform.js";

const j = jscodeshift.withParser("tsx");
const api = { jscodeshift: j, j, stats: () => {}, report: () => {} };

describe("TypeScript prepass output refinement", () => {
  it("does not expose className/style from a local styled base when external styles are disabled", () => {
    const fixtureDir = mkdtempSync(path.join(tmpdir(), "typescript-prepass-styled-base-"));
    const filePath = path.join(fixtureDir, "Label.tsx");
    const source = [
      'import * as React from "react";',
      'import styled from "styled-components";',
      "",
      "type TextProps = React.PropsWithChildren<{",
      "  as?: React.ElementType;",
      "  className?: string;",
      "  style?: React.CSSProperties;",
      "}>;",
      "",
      "const Text = styled.span<TextProps>`",
      "  line-height: 1.5;",
      "`;",
      "",
      'export const Label = styled(Text).attrs({ as: "label" })<{ htmlFor?: string }>`',
      "  cursor: pointer;",
      "`;",
      "",
      'export const App = () => <Label htmlFor="input-id">Label</Label>;',
    ].join("\n");
    writeFileSync(filePath, source);

    try {
      const typeScriptMetadata = analyzeTypeScriptProgram({ files: [filePath], cwd: fixtureDir });
      const after = transformWithWarnings({ source, path: filePath }, api, {
        adapter: fixtureAdapter,
        crossFileInfo: {
          selectorUsages: [],
          typeScriptMetadata,
        },
      });

      expect(after.code).toContain('"className" | "style" | "as"');
      expect(after.code).not.toContain('Omit<React.ComponentPropsWithRef<typeof Text>, "as">');
    } finally {
      rmSync(fixtureDir, { recursive: true, force: true });
    }
  });

  it("does not treat intrinsic pass-through props as explicit sx support on custom components", () => {
    const fixtureDir = mkdtempSync(path.join(tmpdir(), "typescript-prepass-intrinsic-props-"));
    const filePath = path.join(fixtureDir, "IconButton.tsx");
    const source = [
      'import * as React from "react";',
      'import styled from "styled-components";',
      "",
      'const IconButton = (props: React.ComponentProps<"button">) => <button {...props} />;',
      "",
      "const StyledIconButton = styled(IconButton)<{ useRoundStyle?: boolean }>`",
      '  ${(props) => props.useRoundStyle !== false && "border-radius: 100%;"}',
      "  padding: 4px;",
      "`;",
      "",
      "export const App = () => <StyledIconButton>Icon</StyledIconButton>;",
    ].join("\n");
    writeFileSync(filePath, source);

    try {
      const typeScriptMetadata = analyzeTypeScriptProgram({ files: [filePath], cwd: fixtureDir });
      const after = transformWithWarnings({ source, path: filePath }, api, {
        adapter: fixtureAdapter,
        crossFileInfo: {
          selectorUsages: [],
          typeScriptMetadata,
        },
      });

      expect(after.code).toContain("{...stylex.props(");
      expect(after.code).not.toContain("<IconButton\n      {...rest}\n      sx=");
    } finally {
      rmSync(fixtureDir, { recursive: true, force: true });
    }
  });

  it("does not widen closed spread-only props to className/style support", () => {
    const fixtureDir = mkdtempSync(path.join(tmpdir(), "typescript-prepass-output-"));
    const filePath = path.join(fixtureDir, "Box.tsx");
    const source = [
      'import styled from "styled-components";',
      "",
      "type BoxProps = { tone?: 'info' | 'warning' };",
      "",
      "export const Box = styled.div<BoxProps>`",
      "  color: ${(props) => props.tone === 'warning' ? 'orange' : 'blue'};",
      "`;",
      "",
      "const boxProps: BoxProps = { tone: 'info' };",
      "export const App = () => <Box {...boxProps}>Box</Box>;",
    ].join("\n");
    writeFileSync(filePath, source);

    try {
      const adapter = {
        ...fixtureAdapter,
        useSxProp: true,
        externalInterface: () => ({
          styles: true,
          as: false,
          ref: false,
          className: false,
          style: false,
          elementProps: false,
          spreadProps: true,
        }),
      };
      const before = transformWithWarnings({ source, path: filePath }, api, { adapter });
      const typeScriptMetadata = analyzeTypeScriptProgram({ files: [filePath], cwd: fixtureDir });
      const after = transformWithWarnings({ source, path: filePath }, api, {
        adapter,
        crossFileInfo: {
          selectorUsages: [],
          typeScriptMetadata,
        },
      });

      expect(before.code).toContain("className");
      expect(before.code).toContain("style,");
      expect(after.code).toContain("sx?: stylex.StyleXStyles");
      expect(after.code).toContain('Omit<React.ComponentProps<"div">, "className" | "style">');
      expect(after.code).not.toContain("className,");
      expect(after.code).not.toContain("style,");
      expect(after.code).not.toContain("mergedSx");
    } finally {
      rmSync(fixtureDir, { recursive: true, force: true });
    }
  });

  it("uses imported component prop metadata when typing component wrappers", () => {
    const fixtureDir = mkdtempSync(path.join(tmpdir(), "typescript-prepass-imported-output-"));
    const basePath = path.join(fixtureDir, "Base.tsx");
    const wrapperPath = path.join(fixtureDir, "Wrapper.tsx");
    writeFileSync(
      basePath,
      [
        "export type BaseProps = { className: string; label: string };",
        "export function Base(props: BaseProps) {",
        "  return <button className={props.className}>{props.label}</button>;",
        "}",
      ].join("\n"),
    );
    const source = [
      'import styled from "styled-components";',
      'import { Base } from "./Base";',
      "",
      "export const Wrapped = styled(Base)`",
      "  color: red;",
      "`;",
      "",
      'export const App = () => <Wrapped label="Save" />;',
    ].join("\n");
    writeFileSync(wrapperPath, source);

    try {
      const adapter = {
        ...fixtureAdapter,
        externalInterface: () => ({ styles: false, as: false, ref: false }),
      };
      const typeScriptMetadata = analyzeTypeScriptProgram({
        files: [basePath, wrapperPath],
        cwd: fixtureDir,
      });
      const before = transformWithWarnings({ source, path: wrapperPath }, api, { adapter });
      const after = transformWithWarnings({ source, path: wrapperPath }, api, {
        adapter,
        crossFileInfo: {
          selectorUsages: [],
          typeScriptMetadata,
        },
        resolveModule: (fromFile, specifier) =>
          specifier === "./Base" ? basePath : path.resolve(path.dirname(fromFile), specifier),
      });

      expect(before.code).not.toContain("className?: string");
      expect(after.code).toContain(
        'Omit<React.ComponentPropsWithRef<typeof Base>, "className" | "style">',
      );
      expect(after.code).not.toContain("className?: string");
    } finally {
      rmSync(fixtureDir, { recursive: true, force: true });
    }
  });

  it("uses imported prop metadata for optional dynamic style functions", () => {
    const fixtureDir = mkdtempSync(path.join(tmpdir(), "typescript-prepass-style-fn-output-"));
    const typesPath = path.join(fixtureDir, "types.ts");
    const boxPath = path.join(fixtureDir, "Box.tsx");
    writeFileSync(typesPath, "export type SizeProps = { size?: number };");
    const source = [
      'import styled from "styled-components";',
      'import type { SizeProps } from "./types";',
      "",
      "export const Box = styled.div<SizeProps>`",
      "  width: ${(props) => props.size}px;",
      "`;",
      "",
      "export const App = () => <Box>Box</Box>;",
    ].join("\n");
    writeFileSync(boxPath, source);

    try {
      const typeScriptMetadata = analyzeTypeScriptProgram({
        files: [typesPath, boxPath],
        cwd: fixtureDir,
      });
      const before = transformWithWarnings({ source, path: boxPath }, api, {
        adapter: fixtureAdapter,
      });
      const after = transformWithWarnings({ source, path: boxPath }, api, {
        adapter: fixtureAdapter,
        crossFileInfo: {
          selectorUsages: [],
          typeScriptMetadata,
        },
      });

      expect(before.code).toContain("sx={styles.boxWidth(size)}");
      expect(before.code).toContain("boxWidth: (size: string)");
      expect(after.code).toContain("sx={size != null && styles.boxWidth(size)}");
      expect(after.code).toContain("boxWidth: (size: number)");
    } finally {
      rmSync(fixtureDir, { recursive: true, force: true });
    }
  });
});

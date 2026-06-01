import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import jscodeshift from "jscodeshift";
import { describe, expect, it } from "vitest";

import { fixtureAdapter } from "./fixture-adapters.js";
import { analyzeTypeScriptProgram } from "../internal/prepass/typescript-analysis.js";
import { transformedComponentAcceptsSx } from "../internal/utilities/sx-surface.js";
import { transformWithWarnings } from "../transform.js";

const j = jscodeshift.withParser("tsx");
const api = { jscodeshift: j, j, stats: () => {}, report: () => {} };

describe("TypeScript prepass output refinement", () => {
  it("bounds same-run sx detection to the matched component declaration", () => {
    const source = [
      "export function Plain(props: { label?: string }) {",
      "  return <button>{props.label}</button>;",
      "}",
      "",
      "export function SxButton(props: { sx?: stylex.StyleXStyles }) {",
      "  return <button />;",
      "}",
    ].join("\n");

    expect(
      transformedComponentAcceptsSx({
        absolutePath: "/tmp/components.tsx",
        componentNames: ["Plain"],
        sourceOverrides: new Map([["/tmp/components.tsx", source]]),
      }),
    ).toBe(false);
    expect(
      transformedComponentAcceptsSx({
        absolutePath: "/tmp/components.tsx",
        componentNames: ["SxButton"],
        sourceOverrides: new Map([["/tmp/components.tsx", source]]),
      }),
    ).toBe(true);
  });

  it("detects anonymous default function sx props in fallback source scanning", () => {
    const source = [
      'import type { StyleXStyles } from "@stylexjs/stylex";',
      "export default function(props: { sx?: StyleXStyles; label?: string }) {",
      "  return <button>{props.label}</button>;",
      "}",
    ].join("\n");

    expect(
      transformedComponentAcceptsSx({
        absolutePath: "/tmp/components.tsx",
        componentNames: ["default"],
        sourceOverrides: new Map([["/tmp/components.tsx", source]]),
      }),
    ).toBe(true);
  });

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

  it("recognizes single-quoted intrinsic pass-through props on custom components", () => {
    const fixtureDir = mkdtempSync(path.join(tmpdir(), "typescript-prepass-single-quote-"));
    const filePath = path.join(fixtureDir, "Box.tsx");
    const source = [
      'import * as React from "react";',
      'import styled from "styled-components";',
      "",
      "const Base = (props: React.ComponentPropsWithRef<'div'>) => <div {...props} />;",
      "",
      "const Wrapped = styled(Base)`",
      "  color: red;",
      "`;",
      "",
      "export const App = () => <Wrapped>Box</Wrapped>;",
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

      expect(after.code).not.toBeNull();
      expect(after.code).toContain("{...stylex.props(");
    } finally {
      rmSync(fixtureDir, { recursive: true, force: true });
    }
  });

  it("recognizes intrinsic pass-through props from React namespace aliases", () => {
    const fixtureDir = mkdtempSync(path.join(tmpdir(), "typescript-prepass-react-alias-"));
    const filePath = path.join(fixtureDir, "Box.tsx");
    const source = [
      'import * as R from "react";',
      'import styled from "styled-components";',
      "",
      "const Base = (props: R.ComponentPropsWithRef<'div'>) => <div {...props} />;",
      "",
      "const Wrapped = styled(Base)`",
      "  color: red;",
      "`;",
      "",
      "export const App = () => <Wrapped>Box</Wrapped>;",
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

      expect(after.code).not.toBeNull();
      expect(after.code).toContain("{...stylex.props(");
    } finally {
      rmSync(fixtureDir, { recursive: true, force: true });
    }
  });

  it("recognizes intrinsic pass-through props from direct React utility imports", () => {
    const fixtureDir = mkdtempSync(path.join(tmpdir(), "typescript-prepass-react-utility-"));
    const filePath = path.join(fixtureDir, "Button.tsx");
    const source = [
      'import * as React from "react";',
      'import type { ComponentPropsWithoutRef } from "react";',
      'import styled from "styled-components";',
      "",
      'const Base = (props: ComponentPropsWithoutRef<"button">) => <button {...props} />;',
      "",
      "const Wrapped = styled(Base)`",
      "  color: red;",
      "`;",
      "",
      "export const App = () => <Wrapped>Button</Wrapped>;",
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

      expect(after.code).not.toBeNull();
      expect(after.code).toContain("{...stylex.props(");
    } finally {
      rmSync(fixtureDir, { recursive: true, force: true });
    }
  });

  it("bails when a local wrapped component has no style channel despite nested sx reads", () => {
    const fixtureDir = mkdtempSync(path.join(tmpdir(), "typescript-prepass-shadowed-sx-"));
    const filePath = path.join(fixtureDir, "Panel.tsx");
    const source = [
      'import * as React from "react";',
      'import styled from "styled-components";',
      "",
      "type SxStyles = { readonly __stylex?: string };",
      "function Panel(props: { items: Array<{ sx?: SxStyles }>; children?: React.ReactNode }) {",
      "  return <section>{props.items.map((props) => props.sx ? 'sx' : '')}{props.children}</section>;",
      "}",
      "",
      "export const Wrapped = styled(Panel)`",
      "  color: red;",
      "`;",
      "",
      "export const App = () => <Wrapped items={[{}]}>Panel</Wrapped>;",
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

      expect(after.code).toBeNull();
      expect(after.warnings.map((warning) => warning.type)).toContain(
        "Wrapped component does not accept className or sx for generated StyleX styles",
      );
    } finally {
      rmSync(fixtureDir, { recursive: true, force: true });
    }
  });

  it("does not treat unused rest destructuring as className support", () => {
    const fixtureDir = mkdtempSync(path.join(tmpdir(), "typescript-prepass-unused-rest-"));
    const filePath = path.join(fixtureDir, "Panel.tsx");
    const source = [
      'import * as React from "react";',
      'import styled from "styled-components";',
      "",
      "function Panel({ ...rest }: { label?: string; children?: React.ReactNode }) {",
      "  return <section>Panel</section>;",
      "}",
      "",
      "export const Wrapped = styled(Panel)`",
      "  color: red;",
      "`;",
      "",
      'export const App = () => <Wrapped label="Panel">Panel</Wrapped>;',
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

      expect(after.code).toBeNull();
      expect(after.warnings.map((warning) => warning.type)).toContain(
        "Wrapped component does not accept className or sx for generated StyleX styles",
      );
    } finally {
      rmSync(fixtureDir, { recursive: true, force: true });
    }
  });

  it("uses sx for wrapped components with mapped sx props", () => {
    const fixtureDir = mkdtempSync(path.join(tmpdir(), "typescript-prepass-mapped-sx-"));
    const filePath = path.join(fixtureDir, "Panel.tsx");
    const source = [
      'import * as React from "react";',
      'import styled from "styled-components";',
      "",
      "type SxStyles = { readonly __stylex?: string };",
      "type SxProps = { sx?: SxStyles };",
      "type PanelProps = Pick<SxProps, 'sx'> & { label?: string; children?: React.ReactNode };",
      "function Panel(props: PanelProps) {",
      "  return <section>{props.label}{props.children}</section>;",
      "}",
      "",
      "export const Wrapped = styled(Panel)`",
      "  color: red;",
      "`;",
      "",
      'export const App = () => <Wrapped label="Panel">Panel</Wrapped>;',
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

      expect(after.code).toContain("<Panel {...rest} sx={[styles.wrapped, sx]} />");
      expect(after.code).not.toContain("{...stylex.props(styles.wrapped)}");
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

  it("falls back to disk source for sx-aware imports when metadata is unavailable", () => {
    const fixtureDir = mkdtempSync(path.join(tmpdir(), "typescript-prepass-disk-sx-"));
    const basePath = path.join(fixtureDir, "Base.tsx");
    const wrapperPath = path.join(fixtureDir, "Wrapper.tsx");
    writeFileSync(
      basePath,
      [
        'import * as stylex from "@stylexjs/stylex";',
        "export function Base(props: { sx?: stylex.StyleXStyles; label?: string }) {",
        "  return <button>{props.label}</button>;",
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
      const after = transformWithWarnings({ source, path: wrapperPath }, api, {
        adapter: fixtureAdapter,
        resolveModule: (fromFile, specifier) =>
          specifier === "./Base" ? basePath : path.resolve(path.dirname(fromFile), specifier),
      });

      expect(after.code).toContain("<Base {...rest} sx={[styles.wrapped, sx]}");
      expect(after.code).not.toContain("{...stylex.props(styles.wrapped)}");
    } finally {
      rmSync(fixtureDir, { recursive: true, force: true });
    }
  });

  it("falls back to disk source through local sx prop type aliases", () => {
    const fixtureDir = mkdtempSync(path.join(tmpdir(), "typescript-prepass-disk-alias-sx-"));
    const basePath = path.join(fixtureDir, "Base.tsx");
    const wrapperPath = path.join(fixtureDir, "Wrapper.tsx");
    writeFileSync(
      basePath,
      [
        'import * as stylex from "@stylexjs/stylex";',
        "type BaseProps = { sx?: stylex.StyleXStyles; label?: string };",
        "export function Base(props: BaseProps) {",
        "  return <button>{props.label}</button>;",
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
      const after = transformWithWarnings({ source, path: wrapperPath }, api, {
        adapter: fixtureAdapter,
        resolveModule: (fromFile, specifier) =>
          specifier === "./Base" ? basePath : path.resolve(path.dirname(fromFile), specifier),
      });

      expect(after.code).toContain("<Base {...rest} sx={[styles.wrapped, sx]}");
      expect(after.code).not.toContain("{...stylex.props(styles.wrapped)}");
    } finally {
      rmSync(fixtureDir, { recursive: true, force: true });
    }
  });

  it("does not use same-named TypeScript metadata for unresolved package imports", () => {
    const fixtureDir = mkdtempSync(path.join(tmpdir(), "typescript-prepass-package-name-"));
    const localPath = path.join(fixtureDir, "LocalButton.tsx");
    const sourcePath = path.join(fixtureDir, "Wrapper.tsx");
    writeFileSync(
      localPath,
      [
        'import * as stylex from "@stylexjs/stylex";',
        "export function Button(props: { sx?: stylex.StyleXStyles }) {",
        "  return <button />;",
        "}",
      ].join("\n"),
    );
    const source = [
      'import styled from "styled-components";',
      'import { Button } from "external-lib";',
      "",
      "export const Wrapped = styled(Button)`",
      "  color: red;",
      "`;",
      "",
      "export const App = () => <Wrapped />;",
    ].join("\n");
    writeFileSync(sourcePath, source);

    try {
      const typeScriptMetadata = analyzeTypeScriptProgram({
        files: [localPath, sourcePath],
        cwd: fixtureDir,
      });
      const after = transformWithWarnings({ source, path: sourcePath }, api, {
        adapter: fixtureAdapter,
        crossFileInfo: {
          selectorUsages: [],
          typeScriptMetadata,
        },
      });

      expect(after.code).toContain("{...stylex.props(styles.wrapped)}");
      expect(after.code).not.toContain("sx={styles.wrapped}");
    } finally {
      rmSync(fixtureDir, { recursive: true, force: true });
    }
  });

  it("normalizes already-transformed import paths before wrapped component validation", () => {
    const fixtureDir = mkdtempSync(path.join(tmpdir(), "typescript-prepass-realpath-skip-"));
    const realDir = path.join(fixtureDir, "real");
    const linkDir = path.join(fixtureDir, "link");
    const baseRealPath = path.join(realDir, "Base.tsx");
    const baseLinkPath = path.join(linkDir, "Base.tsx");
    const wrapperPath = path.join(fixtureDir, "Wrapper.tsx");
    mkdirSync(realDir);
    writeFileSync(
      baseRealPath,
      [
        "export function Base(props: { label?: string }) {",
        "  return <button>{props.label}</button>;",
        "}",
      ].join("\n"),
    );
    symlinkSync(realDir, linkDir, "dir");
    const source = [
      'import styled from "styled-components";',
      'import { Base } from "./link/Base";',
      "",
      "export const Wrapped = styled(Base)`",
      "  color: red;",
      "`;",
      "",
      'export const App = () => <Wrapped label="Save" />;',
    ].join("\n");
    writeFileSync(wrapperPath, source);

    try {
      const typeScriptMetadata = analyzeTypeScriptProgram({
        files: [baseLinkPath, wrapperPath],
        cwd: fixtureDir,
      });
      const after = transformWithWarnings({ source, path: wrapperPath }, api, {
        adapter: fixtureAdapter,
        crossFileInfo: {
          selectorUsages: [],
          typeScriptMetadata,
        },
        resolveModule: (fromFile, specifier) =>
          specifier === "./link/Base"
            ? baseLinkPath
            : path.resolve(path.dirname(fromFile), specifier),
        transformedFileSources: new Map([[realpathSync(baseRealPath), "already transformed"]]),
      });

      expect(after.warnings.map((warning) => warning.type)).not.toContain(
        "Wrapped component does not accept className or sx for generated StyleX styles",
      );
    } finally {
      rmSync(fixtureDir, { recursive: true, force: true });
    }
  });

  it("resolves extensionless already-transformed import paths before wrapped component validation", () => {
    const fixtureDir = mkdtempSync(path.join(tmpdir(), "typescript-prepass-extensionless-skip-"));
    const basePath = path.join(fixtureDir, "Base.tsx");
    const basePathWithoutExtension = path.join(fixtureDir, "Base");
    const wrapperPath = path.join(fixtureDir, "Wrapper.tsx");
    writeFileSync(
      basePath,
      [
        "export function Base(props: { label?: string }) {",
        "  return <button>{props.label}</button>;",
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
      const typeScriptMetadata = analyzeTypeScriptProgram({
        files: [basePath, wrapperPath],
        cwd: fixtureDir,
      });
      const after = transformWithWarnings({ source, path: wrapperPath }, api, {
        adapter: fixtureAdapter,
        crossFileInfo: {
          selectorUsages: [],
          typeScriptMetadata,
        },
        resolveModule: (fromFile, specifier) =>
          specifier === "./Base"
            ? basePathWithoutExtension
            : path.resolve(path.dirname(fromFile), specifier),
        transformedFileSources: new Map([[realpathSync(basePath), "already transformed"]]),
      });

      expect(after.warnings.map((warning) => warning.type)).not.toContain(
        "Wrapped component does not accept className or sx for generated StyleX styles",
      );
    } finally {
      rmSync(fixtureDir, { recursive: true, force: true });
    }
  });

  it("bails instead of widening local wrapped component props for generated styles", () => {
    const fixtureDir = mkdtempSync(path.join(tmpdir(), "typescript-prepass-local-wrapper-bail-"));
    const filePath = path.join(fixtureDir, "Wrapper.tsx");
    const source = [
      'import styled from "styled-components";',
      "",
      "function Base(props: { label?: string }) {",
      "  return <button>{props.label}</button>;",
      "}",
      "",
      "export const Wrapped = styled(Base)`",
      "  color: red;",
      "`;",
      "",
      'export const App = () => <Wrapped label="Save" />;',
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

      expect(after.code).toBeNull();
      expect(after.warnings.map((warning) => warning.type)).toContain(
        "Wrapped component does not accept className or sx for generated StyleX styles",
      );
    } finally {
      rmSync(fixtureDir, { recursive: true, force: true });
    }
  });

  it("uses physical shorthand styles rejected by a wrapped component sx surface", () => {
    const fixtureDir = mkdtempSync(path.join(tmpdir(), "typescript-prepass-sx-without-"));
    const sourcePath = path.join(fixtureDir, "Wrapper.tsx");
    const buttonPath = path.join(fixtureDir, "Button.tsx");
    const source = [
      'import styled from "styled-components";',
      'import { Button } from "./Button";',
      "",
      'const WidgetButton = styled(Button).attrs({ size: "small", variant: "borderless" })`',
      "  padding: 4px 6px;",
      "  margin-left: -6px;",
      "`;",
      "",
      'export const App = () => <WidgetButton aria-label="Open" />;',
    ].join("\n");
    writeFileSync(sourcePath, source);
    writeFileSync(
      buttonPath,
      [
        'import * as React from "react";',
        'import * as stylex from "@stylexjs/stylex";',
        "",
        "type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {",
        "  sx?: stylex.StyleXStylesWithout<{",
        "    paddingBlock?: string | number | null;",
        "    paddingInline?: string | number | null;",
        "  }>;",
        "};",
        "",
        "export function Button(props: ButtonProps) {",
        "  return <button {...props} />;",
        "}",
      ].join("\n"),
    );

    try {
      const typeScriptMetadata = analyzeTypeScriptProgram({
        files: [buttonPath, sourcePath],
        cwd: fixtureDir,
      });
      const after = transformWithWarnings({ source, path: sourcePath }, api, {
        adapter: {
          ...fixtureAdapter,
          wrappedComponentInterface(ctx) {
            return ctx.importedName === "Button" ? { acceptsSx: true } : undefined;
          },
        },
        crossFileInfo: {
          selectorUsages: [],
          typeScriptMetadata,
        },
      });

      expect(after.code).toContain("paddingTop: 4");
      expect(after.code).toContain("paddingRight: 6");
      expect(after.code).toContain("paddingBottom: 4");
      expect(after.code).toContain("paddingLeft: 6");
      expect(after.code).not.toMatch(/^\s+paddingBlock:/m);
      expect(after.code).not.toContain("paddingInline: 6");
      expect(after.code).toContain("sx={[styles.widgetButton, sx]}");
      expect(after.code).not.toContain("{...stylex.props(styles.widgetButton)}");
    } finally {
      rmSync(fixtureDir, { recursive: true, force: true });
    }
  });

  it("bails when a restricted sx wrapper emits pseudo-expand logical styles", () => {
    const fixtureDir = mkdtempSync(
      path.join(tmpdir(), "typescript-prepass-sx-pseudo-expand-bail-"),
    );
    const sourcePath = path.join(fixtureDir, "Wrapper.tsx");
    const source = [
      'import styled from "styled-components";',
      'import { Button } from "./Button";',
      'import { highlightExpand } from "./lib/helpers";',
      "",
      "const WidgetButton = styled(Button)<{ $active?: boolean }>`",
      "  &:${highlightExpand} {",
      "    ${(props) => props.$active && `padding-block: 4px;`}",
      "  }",
      "`;",
      "",
      'export const App = () => <WidgetButton $active aria-label="Open" />;',
    ].join("\n");
    writeFileSync(sourcePath, source);

    try {
      const after = transformWithWarnings({ source, path: sourcePath }, api, {
        adapter: {
          ...fixtureAdapter,
          wrappedComponentInterface(ctx) {
            return ctx.importedName === "Button"
              ? {
                  acceptsSx: true,
                  sxExcludedProperties: ["paddingBlock"],
                }
              : undefined;
          },
        },
        crossFileInfo: {
          selectorUsages: [],
        },
      });

      expect(after.code).toBeNull();
      expect(after.warnings).toContainEqual(
        expect.objectContaining({
          type: "Wrapped component sx prop rejects logical CSS properties that cannot be preserved losslessly",
          context: expect.objectContaining({
            property: "paddingBlock",
          }),
        }),
      );
    } finally {
      rmSync(fixtureDir, { recursive: true, force: true });
    }
  });

  it("bails when a restricted sx wrapper uses true logical CSS properties", () => {
    const fixtureDir = mkdtempSync(path.join(tmpdir(), "typescript-prepass-sx-logical-bail-"));
    const sourcePath = path.join(fixtureDir, "Wrapper.tsx");
    const source = [
      'import styled from "styled-components";',
      'import { Button } from "./Button";',
      "",
      "const WidgetButton = styled(Button)`",
      "  padding-block: 4px;",
      "  padding-inline: 6px;",
      "`;",
      "",
      'export const App = () => <WidgetButton aria-label="Open" />;',
    ].join("\n");
    writeFileSync(sourcePath, source);

    try {
      const after = transformWithWarnings({ source, path: sourcePath }, api, {
        adapter: {
          ...fixtureAdapter,
          wrappedComponentInterface(ctx) {
            return ctx.importedName === "Button"
              ? {
                  acceptsSx: true,
                  sxExcludedProperties: ["paddingBlock", "paddingInline"],
                }
              : undefined;
          },
        },
        crossFileInfo: {
          selectorUsages: [],
        },
      });

      expect(after.code).toBeNull();
      expect(after.warnings).toContainEqual(
        expect.objectContaining({
          type: "Wrapped component sx prop rejects logical CSS properties that cannot be preserved losslessly",
        }),
      );
    } finally {
      rmSync(fixtureDir, { recursive: true, force: true });
    }
  });

  it("bails when an sx-aware wrapped component only accepts a narrow property surface", () => {
    const fixtureDir = mkdtempSync(path.join(tmpdir(), "typescript-prepass-sx-allowlist-bail-"));
    const sourcePath = path.join(fixtureDir, "Wrapper.tsx");
    const colorTriggerPath = path.join(fixtureDir, "ColorTrigger.tsx");
    const source = [
      'import styled from "styled-components";',
      'import { ColorTrigger } from "./ColorTrigger";',
      "",
      "const CompactTrigger = styled(ColorTrigger)`",
      "  background-color: transparent;",
      "  border: none;",
      "  height: 25px;",
      "  width: 25px;",
      "`;",
      "",
      'export const App = () => <CompactTrigger aria-label="Pick color" />;',
    ].join("\n");
    writeFileSync(sourcePath, source);
    writeFileSync(
      colorTriggerPath,
      [
        'import * as React from "react";',
        'import * as stylex from "@stylexjs/stylex";',
        "",
        "interface InputProps {",
        "  sx?: stylex.StyleXStyles<{",
        "    backgroundColor?: string;",
        "    width?: number | string;",
        "  }>;",
        "}",
        "",
        "export interface ColorTriggerProps extends InputProps {",
        "  value?: string;",
        "}",
        "",
        "export function ColorTrigger(props: ColorTriggerProps) {",
        "  return <button {...props} />;",
        "}",
      ].join("\n"),
    );

    try {
      const typeScriptMetadata = analyzeTypeScriptProgram({
        files: [colorTriggerPath, sourcePath],
        cwd: fixtureDir,
      });
      const after = transformWithWarnings({ source, path: sourcePath }, api, {
        adapter: fixtureAdapter,
        crossFileInfo: {
          selectorUsages: [],
          typeScriptMetadata,
        },
      });

      expect(after.code).toBeNull();
      expect(after.warnings).toContainEqual(
        expect.objectContaining({
          type: "Wrapped component sx prop does not accept generated StyleX property",
          context: expect.objectContaining({
            property: "borderWidth",
          }),
        }),
      );
    } finally {
      rmSync(fixtureDir, { recursive: true, force: true });
    }
  });

  it("bails when TypeScript metadata resolves an empty sx allowlist", () => {
    const fixtureDir = mkdtempSync(
      path.join(tmpdir(), "typescript-prepass-sx-empty-allowlist-bail-"),
    );
    const sourcePath = path.join(fixtureDir, "Wrapper.tsx");
    const colorTriggerPath = path.join(fixtureDir, "ColorTrigger.tsx");
    const source = [
      'import styled from "styled-components";',
      'import { ColorTrigger } from "./ColorTrigger";',
      "",
      "const CompactTrigger = styled(ColorTrigger)`",
      "  background-color: transparent;",
      "`;",
      "",
      'export const App = () => <CompactTrigger aria-label="Pick color" />;',
    ].join("\n");
    writeFileSync(sourcePath, source);
    writeFileSync(
      colorTriggerPath,
      [
        'import * as stylex from "@stylexjs/stylex";',
        "",
        "interface EmptySxSurface {}",
        "",
        "export interface ColorTriggerProps {",
        "  sx?: stylex.StyleXStyles<EmptySxSurface>;",
        "  value?: string;",
        "}",
        "",
        "export function ColorTrigger(props: ColorTriggerProps) {",
        "  return <button {...props} />;",
        "}",
      ].join("\n"),
    );

    try {
      const typeScriptMetadata = analyzeTypeScriptProgram({
        files: [colorTriggerPath, sourcePath],
        cwd: fixtureDir,
      });
      const after = transformWithWarnings({ source, path: sourcePath }, api, {
        adapter: fixtureAdapter,
        crossFileInfo: {
          selectorUsages: [],
          typeScriptMetadata,
        },
      });

      expect(after.code).toBeNull();
      expect(after.warnings).toContainEqual(
        expect.objectContaining({
          type: "Wrapped component sx prop does not accept generated StyleX property",
          context: expect.objectContaining({
            property: "backgroundColor",
          }),
        }),
      );
    } finally {
      rmSync(fixtureDir, { recursive: true, force: true });
    }
  });

  it("treats an empty wrapped component sx allowlist as deny-all", () => {
    const source = [
      'import styled from "styled-components";',
      'import { ColorTrigger } from "./ColorTrigger";',
      "",
      "const CompactTrigger = styled(ColorTrigger)`",
      "  background-color: transparent;",
      "`;",
      "",
      'export const App = () => <CompactTrigger aria-label="Pick color" />;',
    ].join("\n");

    const after = transformWithWarnings({ source, path: "/tmp/Wrapper.tsx" }, api, {
      adapter: {
        ...fixtureAdapter,
        wrappedComponentInterface(ctx) {
          if (ctx.localName === "ColorTrigger") {
            return { acceptsSx: true, sxAllowedProperties: [] };
          }
          return undefined;
        },
      },
    });

    expect(after.code).toBeNull();
    expect(after.warnings).toContainEqual(
      expect.objectContaining({
        type: "Wrapped component sx prop does not accept generated StyleX property",
        context: expect.objectContaining({
          property: "backgroundColor",
        }),
      }),
    );
  });

  it("merges empty TypeScript sx allowlists into adapter wrapped component interfaces", () => {
    const fixtureDir = mkdtempSync(
      path.join(tmpdir(), "typescript-prepass-adapter-empty-allowlist-"),
    );
    const sourcePath = path.join(fixtureDir, "Wrapper.tsx");
    const colorTriggerPath = path.join(fixtureDir, "ColorTrigger.tsx");
    const source = [
      'import styled from "styled-components";',
      'import { ColorTrigger } from "./ColorTrigger";',
      "",
      "const CompactTrigger = styled(ColorTrigger)`",
      "  background-color: transparent;",
      "`;",
      "",
      'export const App = () => <CompactTrigger aria-label="Pick color" />;',
    ].join("\n");
    writeFileSync(sourcePath, source);
    writeFileSync(
      colorTriggerPath,
      [
        'import * as stylex from "@stylexjs/stylex";',
        "",
        "interface EmptySxSurface {}",
        "",
        "export interface ColorTriggerProps {",
        "  sx?: stylex.StyleXStyles<EmptySxSurface>;",
        "  value?: string;",
        "}",
        "",
        "export function ColorTrigger(props: ColorTriggerProps) {",
        "  return <button {...props} />;",
        "}",
      ].join("\n"),
    );

    try {
      const typeScriptMetadata = analyzeTypeScriptProgram({
        files: [colorTriggerPath, sourcePath],
        cwd: fixtureDir,
      });
      const after = transformWithWarnings({ source, path: sourcePath }, api, {
        adapter: {
          ...fixtureAdapter,
          wrappedComponentInterface(ctx) {
            if (ctx.localName === "ColorTrigger") {
              return { acceptsSx: true };
            }
            return undefined;
          },
        },
        crossFileInfo: {
          selectorUsages: [],
          typeScriptMetadata,
        },
      });

      expect(after.code).toBeNull();
      expect(after.warnings).toContainEqual(
        expect.objectContaining({
          type: "Wrapped component sx prop does not accept generated StyleX property",
          context: expect.objectContaining({
            property: "backgroundColor",
          }),
        }),
      );
    } finally {
      rmSync(fixtureDir, { recursive: true, force: true });
    }
  });

  it("bails when a wrapped component sx prop targets an inner element for root styles", () => {
    const fixtureDir = mkdtempSync(path.join(tmpdir(), "typescript-prepass-inner-sx-target-"));
    const sourcePath = path.join(fixtureDir, "Wrapper.tsx");
    const source = [
      'import styled from "styled-components";',
      'import { Checkbox } from "./Checkbox";',
      "",
      "const StyledCheckbox = styled(Checkbox)`",
      "  margin-top: 0;",
      "`;",
      "",
      'export const App = () => <StyledCheckbox aria-label="Done" />;',
    ].join("\n");
    writeFileSync(sourcePath, source);

    try {
      const after = transformWithWarnings({ source, path: sourcePath }, api, {
        adapter: {
          ...fixtureAdapter,
          wrappedComponentInterface(ctx) {
            return ctx.importedName === "Checkbox"
              ? {
                  acceptsSx: true,
                  sxTarget: "inner",
                  rootOnlyProperties: ["marginTop", "marginRight", "marginBottom", "marginLeft"],
                }
              : undefined;
          },
        },
        crossFileInfo: {
          selectorUsages: [],
        },
      });

      expect(after.code).toBeNull();
      expect(after.warnings).toContainEqual(
        expect.objectContaining({
          type: "Wrapped component sx prop targets an inner element for a root style property",
          context: expect.objectContaining({
            property: "marginTop",
          }),
        }),
      );
    } finally {
      rmSync(fixtureDir, { recursive: true, force: true });
    }
  });

  it("does not pass root styles through sx when props.sx targets an inner element", () => {
    const fixtureDir = mkdtempSync(path.join(tmpdir(), "typescript-prepass-props-sx-target-"));
    const filePath = path.join(fixtureDir, "Field.tsx");
    const source = [
      'import * as React from "react";',
      'import * as stylex from "@stylexjs/stylex";',
      'import styled from "styled-components";',
      "",
      "function LabeledInput(props: { className?: string; sx?: stylex.StyleXStyles; children?: React.ReactNode }) {",
      "  return (",
      "    <label className={props.className}>",
      "      <input sx={props.sx} />",
      "      {props.children}",
      "    </label>",
      "  );",
      "}",
      "",
      "const WrappedInput = styled(LabeledInput)`",
      "  margin-top: 2px;",
      "`;",
      "",
      "export const App = () => <WrappedInput>Field</WrappedInput>;",
    ].join("\n");
    writeFileSync(filePath, source);

    try {
      const typeScriptMetadata = analyzeTypeScriptProgram({ files: [filePath], cwd: fixtureDir });
      expect(
        typeScriptMetadata.files[0]!.components.find(
          (component) => component.name === "LabeledInput",
        )?.sxTarget,
      ).toBe("inner");

      const after = transformWithWarnings({ source, path: filePath }, api, {
        adapter: fixtureAdapter,
        crossFileInfo: {
          selectorUsages: [],
          typeScriptMetadata,
        },
      });

      expect(after.code).not.toBeNull();
      expect(after.code).toContain(
        "<LabeledInput {...props} {...stylex.props(styles.wrappedInput)} />",
      );
      expect(after.code).not.toContain("sx={[styles.wrappedInput, props.sx]}");
    } finally {
      rmSync(fixtureDir, { recursive: true, force: true });
    }
  });

  it("preserves typed inner sx target when adapter returns acceptsSx without constraints", () => {
    const fixtureDir = mkdtempSync(path.join(tmpdir(), "typescript-prepass-imported-inner-sx-"));
    const controlPath = path.join(fixtureDir, "Control.tsx");
    const wrapperPath = path.join(fixtureDir, "Wrapper.tsx");
    const controlSource = [
      'import * as React from "react";',
      'import * as stylex from "@stylexjs/stylex";',
      "",
      "export function Control(props: { className?: string; sx?: stylex.StyleXStyles; children?: React.ReactNode }) {",
      "  return (",
      "    <label className={props.className}>",
      "      <input sx={props.sx} />",
      "      {props.children}",
      "    </label>",
      "  );",
      "}",
      "",
      "export function DestructuredControl(props: { className?: string; sx?: stylex.StyleXStyles; children?: React.ReactNode }) {",
      "  const { className, style } = stylex.props(props.sx);",
      "  return (",
      "    <label className={props.className}>",
      "      <input className={className} style={style} />",
      "      {props.children}",
      "    </label>",
      "  );",
      "}",
    ].join("\n");
    const wrapperSource = [
      'import styled from "styled-components";',
      'import { Control, DestructuredControl } from "./Control";',
      "",
      "const WrappedControl = styled(Control)`",
      "  margin-top: 2px;",
      "`;",
      "",
      "const WrappedDestructuredControl = styled(DestructuredControl)`",
      "  margin-top: 4px;",
      "`;",
      "",
      "export const App = () => (",
      "  <>",
      "    <WrappedControl>Field</WrappedControl>",
      "    <WrappedDestructuredControl>Destructured field</WrappedDestructuredControl>",
      "  </>",
      ");",
    ].join("\n");
    writeFileSync(controlPath, controlSource);
    writeFileSync(wrapperPath, wrapperSource);

    try {
      const typeScriptMetadata = analyzeTypeScriptProgram({
        files: [controlPath, wrapperPath],
        cwd: fixtureDir,
      });
      expect(
        typeScriptMetadata.files
          .flatMap((file) => file.components)
          .find((component) => component.name === "Control")?.sxTarget,
      ).toBe("inner");
      expect(
        typeScriptMetadata.files
          .flatMap((file) => file.components)
          .find((component) => component.name === "DestructuredControl")?.sxTarget,
      ).toBe("inner");

      const after = transformWithWarnings({ source: wrapperSource, path: wrapperPath }, api, {
        adapter: {
          ...fixtureAdapter,
          wrappedComponentInterface(ctx) {
            return ctx.importedName === "Control" || ctx.importedName === "DestructuredControl"
              ? { acceptsSx: true }
              : undefined;
          },
        },
        crossFileInfo: {
          selectorUsages: [],
          typeScriptMetadata,
        },
      });

      expect(after.code).not.toBeNull();
      expect(after.code).toContain(
        "<Control {...props} {...stylex.props(styles.wrappedControl)} />",
      );
      expect(after.code).toContain(
        "<DestructuredControl {...props} {...stylex.props(styles.wrappedDestructuredControl)} />",
      );
      expect(after.code).not.toContain("sx={[styles.wrappedControl, props.sx]}");
      expect(after.code).not.toContain("sx={[styles.wrappedDestructuredControl, props.sx]}");
    } finally {
      rmSync(fixtureDir, { recursive: true, force: true });
    }
  });

  it("expands generated styles rejected by a local wrapped component sx surface", () => {
    const fixtureDir = mkdtempSync(path.join(tmpdir(), "typescript-prepass-local-sx-without-"));
    const sourcePath = path.join(fixtureDir, "Wrapper.tsx");
    const source = [
      'import * as React from "react";',
      'import * as stylex from "@stylexjs/stylex";',
      'import styled from "styled-components";',
      "",
      "interface ExcludedBase {",
      "  marginBlock?: string | number | null;",
      "}",
      "",
      "interface ExcludedProps extends ExcludedBase {",
      "  paddingBlock?: string | number | null;",
      "  paddingInline?: string | number | null;",
      "}",
      "",
      "type BaseButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {",
      "  tone?: 'primary' | 'secondary';",
      "  sx?: stylex.StyleXStylesWithout<ExcludedProps>;",
      "};",
      "",
      'type ButtonProps = Omit<BaseButtonProps, "tone">;',
      "",
      "function Button(props: ButtonProps) {",
      "  return <button {...props} />;",
      "}",
      "",
      'const WidgetButton = styled(Button).attrs({ size: "small", variant: "borderless" })`',
      "  padding: 0 6px;",
      "  margin-left: -6px;",
      "`;",
      "",
      'export const App = () => <WidgetButton aria-label="Open" />;',
    ].join("\n");
    writeFileSync(sourcePath, source);

    try {
      const typeScriptMetadata = analyzeTypeScriptProgram({
        files: [sourcePath],
        cwd: fixtureDir,
      });
      const after = transformWithWarnings({ source, path: sourcePath }, api, {
        adapter: fixtureAdapter,
        crossFileInfo: {
          selectorUsages: [],
          typeScriptMetadata,
        },
      });

      expect(after.code).toContain("paddingTop: 0");
      expect(after.code).toContain("paddingRight: 6");
      expect(after.code).toContain("paddingBottom: 0");
      expect(after.code).toContain("paddingLeft: 6");
      expect(after.code).not.toContain("paddingBlock: 0");
      expect(after.code).not.toContain("paddingInline: 6");
      expect(after.code).toContain("marginLeft: -6");
      expect(after.code).not.toContain("marginBlock:");
      expect(after.code).toContain("sx={[styles.widgetButton, sx]}");
      expect(after.code).not.toContain("{...stylex.props(styles.widgetButton)}");
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

  it("does not emit private imported prop type aliases in style function params", () => {
    const fixtureDir = mkdtempSync(path.join(tmpdir(), "typescript-prepass-private-alias-"));
    const typesPath = path.join(fixtureDir, "types.ts");
    const boxPath = path.join(fixtureDir, "Box.tsx");
    writeFileSync(
      typesPath,
      ["type Width = number;", "export interface BoxProps { width: Width }"].join("\n"),
    );
    const source = [
      'import styled from "styled-components";',
      'import type { BoxProps } from "./types";',
      "",
      "export const Box = styled.div<BoxProps>`",
      "  width: ${(props) => props.width}px;",
      "`;",
      "",
      "export const App = () => <Box width={12}>Box</Box>;",
    ].join("\n");
    writeFileSync(boxPath, source);

    try {
      const typeScriptMetadata = analyzeTypeScriptProgram({
        files: [typesPath, boxPath],
        cwd: fixtureDir,
      });
      const after = transformWithWarnings({ source, path: boxPath }, api, {
        adapter: fixtureAdapter,
        crossFileInfo: {
          selectorUsages: [],
          typeScriptMetadata,
        },
      });

      expect(after.code).toContain("boxWidth: (width: string)");
      expect(after.code).not.toContain("(width: Width)");
    } finally {
      rmSync(fixtureDir, { recursive: true, force: true });
    }
  });
});

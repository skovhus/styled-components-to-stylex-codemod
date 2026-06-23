import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { createModuleResolver } from "../internal/prepass/resolve-imports.js";
import { runPrepass } from "../internal/prepass/run-prepass.js";
import {
  analyzeTypeScriptProgram,
  type TypeScriptPrepassMetadata,
} from "../internal/prepass/typescript-analysis.js";
import { findTypeScriptComponentMetadata } from "../internal/utilities/typescript-metadata.js";
import { runTransform } from "../run.js";

function componentSnapshot(metadata: TypeScriptPrepassMetadata, baseDir: string) {
  const realBase = realpathSync(baseDir);
  return Object.fromEntries(
    metadata.files.flatMap((file) =>
      file.components
        .filter((component) => component.name !== "BodySx" && component.name !== "DefaultAlias")
        .filter((component) => component.name !== "MemoSx" && component.name !== "ForwardRefSx")
        .filter((component) => component.name !== "InnerMemoSx")
        .filter((component) => component.name !== "MemoIdentifierSx")
        .filter((component) => component.name !== "InheritedSx")
        .filter((component) => component.name !== "ShadowedProps")
        .filter((component) => component.name !== "MappedSx")
        .map((component) => [
          `${path.relative(realBase, file.filePath)}:${component.name}`,
          {
            kind: component.kind,
            exported: component.exported,
            typeParameters: component.typeParameters,
            propType: component.propType,
            props: component.props
              .filter((prop) =>
                ["as", "baseOnly", "inherited", "label", "requiredCount", "sx", "tone"].includes(
                  prop.name,
                ),
              )
              .map((prop) => ({
                name: prop.name,
                optional: prop.optional,
                readonly: prop.readonly,
                type: prop.type,
              })),
            parameters: component.parameters,
            restProps: component.restProps,
            supportsSxProp: component.supportsSxProp,
            ...(component.sxExcludedProperties.length > 0
              ? { sxExcludedProperties: component.sxExcludedProperties }
              : {}),
            ...(component.sxAllowedProperties !== undefined
              ? { sxAllowedProperties: component.sxAllowedProperties }
              : {}),
          },
        ]),
    ),
  );
}

describe("TypeScript compiler prepass", () => {
  it("does not use default-export metadata for named import lookups", () => {
    const metadata: TypeScriptPrepassMetadata = {
      version: 1,
      files: [
        {
          filePath: path.resolve("/tmp/components.tsx"),
          functions: [],
          components: [
            {
              name: "DefaultButton",
              kind: "react",
              exported: true,
              defaultExport: true,
              typeParameters: [],
              propType: null,
              props: [],
              explicitPropNames: ["sx"],
              parameters: [],
              restProps: [],
              hasIndexSignature: false,
              supportsSxProp: true,
              sxExcludedProperties: [],
            },
            {
              name: "Plain",
              kind: "react",
              exported: true,
              defaultExport: false,
              typeParameters: [],
              propType: null,
              props: [],
              explicitPropNames: [],
              parameters: [],
              restProps: [],
              hasIndexSignature: false,
              supportsSxProp: false,
              sxExcludedProperties: [],
            },
          ],
        },
      ],
    };

    expect(findTypeScriptComponentMetadata(metadata, "/tmp/components.tsx", ["Plain"])?.name).toBe(
      "Plain",
    );
    expect(findTypeScriptComponentMetadata(metadata, "/tmp/components.tsx", ["Missing"])).toBe(
      undefined,
    );
    expect(
      findTypeScriptComponentMetadata(metadata, "/tmp/components.tsx", ["Alias", "default"])?.name,
    ).toBe("DefaultButton");
  });

  it("extracts properties excluded by StyleXStylesWithout sx props", () => {
    const fixtureDir = mkdtempSync(path.join(tmpdir(), "typescript-prepass-sx-without-"));
    const filePath = path.join(fixtureDir, "Button.tsx");
    writeFileSync(
      filePath,
      [
        'import * as stylex from "@stylexjs/stylex";',
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
        "type BaseButtonProps = {",
        "  tone?: 'primary' | 'secondary';",
        "  sx?: stylex.StyleXStylesWithout<ExcludedProps>;",
        "};",
        "",
        "interface SxSurface extends stylex.StyleXStylesWithout<ExcludedProps> {}",
        "",
        "type ButtonProps = {",
        "  sx?: stylex.StyleXStylesWithout<{",
        "    paddingBlock?: string | number | null;",
        "    paddingInline?: string | number | null;",
        "  }>;",
        "};",
        "",
        'type OmittedButtonProps = Omit<BaseButtonProps, "tone">;',
        'type PickedButtonProps = Pick<BaseButtonProps, "sx">;',
        "type PartialButtonProps = Partial<BaseButtonProps>;",
        "type InterfaceAliasButtonProps = { sx?: SxSurface };",
        'type WithoutSxProps = Pick<BaseButtonProps, "tone">;',
        "",
        "export function Button(props: ButtonProps) {",
        "  return <button />;",
        "}",
        "",
        "export function OmittedButton(props: OmittedButtonProps) {",
        "  return <button />;",
        "}",
        "",
        "export function PickedButton(props: PickedButtonProps) {",
        "  return <button />;",
        "}",
        "",
        "export function PartialButton(props: PartialButtonProps) {",
        "  return <button />;",
        "}",
        "",
        "export function InterfaceAliasButton(props: InterfaceAliasButtonProps) {",
        "  return <button />;",
        "}",
        "",
        "export function WithoutSxButton(props: WithoutSxProps) {",
        "  return <button />;",
        "}",
      ].join("\n"),
    );

    try {
      const metadata = analyzeTypeScriptProgram({ files: [filePath], cwd: fixtureDir });
      const button = findTypeScriptComponentMetadata(metadata, filePath, ["Button"]);
      expect(button?.supportsSxProp).toBe(true);
      expect(button?.sxExcludedProperties).toEqual(["paddingBlock", "paddingInline"]);
      for (const componentName of [
        "OmittedButton",
        "PickedButton",
        "PartialButton",
        "InterfaceAliasButton",
      ]) {
        const component = findTypeScriptComponentMetadata(metadata, filePath, [componentName]);
        expect(component?.supportsSxProp).toBe(true);
        expect(component?.sxExcludedProperties).toEqual([
          "marginBlock",
          "paddingBlock",
          "paddingInline",
        ]);
      }
      const withoutSx = findTypeScriptComponentMetadata(metadata, filePath, ["WithoutSxButton"]);
      expect(withoutSx?.supportsSxProp).toBe(false);
      expect(withoutSx?.sxExcludedProperties).toEqual([]);
    } finally {
      rmSync(fixtureDir, { recursive: true, force: true });
    }
  });

  it("extracts properties accepted by narrow StyleXStyles sx props", () => {
    const fixtureDir = mkdtempSync(path.join(tmpdir(), "typescript-prepass-sx-allowed-"));
    const filePath = path.join(fixtureDir, "Input.tsx");
    writeFileSync(
      filePath,
      [
        'import * as stylex from "@stylexjs/stylex";',
        "",
        "interface InputSxSurface {",
        "  backgroundColor?: string;",
        "  width?: number | string;",
        "}",
        "",
        "interface InputProps {",
        "  sx?: stylex.StyleXStyles<InputSxSurface>;",
        "}",
        "",
        "interface PickerProps extends InputProps {",
        "  value?: string;",
        "}",
        "",
        "type AliasProps = Pick<PickerProps, 'sx' | 'value'>;",
        "",
        "export function Input(props: InputProps) {",
        "  return <input />;",
        "}",
        "",
        "export function Picker(props: PickerProps) {",
        "  return <Input {...props} />;",
        "}",
        "",
        "export function AliasPicker(props: AliasProps) {",
        "  return <Input {...props} />;",
        "}",
      ].join("\n"),
    );

    try {
      const metadata = analyzeTypeScriptProgram({ files: [filePath], cwd: fixtureDir });
      for (const componentName of ["Input", "Picker", "AliasPicker"]) {
        const component = findTypeScriptComponentMetadata(metadata, filePath, [componentName]);
        expect(component?.supportsSxProp).toBe(true);
        expect(component?.sxAllowedProperties).toEqual(["backgroundColor", "width"]);
      }
    } finally {
      rmSync(fixtureDir, { recursive: true, force: true });
    }
  });

  it("preserves empty accepted property lists for narrow StyleXStyles sx props", () => {
    const fixtureDir = mkdtempSync(path.join(tmpdir(), "typescript-prepass-sx-empty-allowlist-"));
    const filePath = path.join(fixtureDir, "Input.tsx");
    writeFileSync(
      filePath,
      [
        'import * as stylex from "@stylexjs/stylex";',
        "",
        "interface EmptySxSurface {}",
        "",
        "interface EmptyInterfaceSx extends stylex.StyleXStyles<EmptySxSurface> {}",
        "",
        "type EmptyAliasSx = stylex.StyleXStyles<{}>;",
        "",
        "type DirectProps = {",
        "  sx?: stylex.StyleXStyles<EmptySxSurface>;",
        "};",
        "",
        "type AliasProps = { sx?: EmptyAliasSx };",
        "",
        "type InterfaceProps = { sx?: EmptyInterfaceSx };",
        "",
        "type BroadProps = { sx?: stylex.StyleXStyles };",
        "",
        "export function DirectInput(props: DirectProps) {",
        "  return <input />;",
        "}",
        "",
        "export function AliasInput(props: AliasProps) {",
        "  return <input />;",
        "}",
        "",
        "export function InterfaceInput(props: InterfaceProps) {",
        "  return <input />;",
        "}",
        "",
        "export function BroadInput(props: BroadProps) {",
        "  return <input />;",
        "}",
      ].join("\n"),
    );

    try {
      const metadata = analyzeTypeScriptProgram({ files: [filePath], cwd: fixtureDir });
      for (const componentName of ["DirectInput", "AliasInput", "InterfaceInput"]) {
        const component = findTypeScriptComponentMetadata(metadata, filePath, [componentName]);
        expect(component?.supportsSxProp).toBe(true);
        expect(component?.sxAllowedProperties).toEqual([]);
      }
      const broad = findTypeScriptComponentMetadata(metadata, filePath, ["BroadInput"]);
      expect(broad?.supportsSxProp).toBe(true);
      expect(broad?.sxAllowedProperties).toBeUndefined();
    } finally {
      rmSync(fixtureDir, { recursive: true, force: true });
    }
  });

  it("extracts serializable component metadata automatically for TypeScript parsers", async () => {
    const fixtureDir = mkdtempSync(path.join(tmpdir(), "typescript-prepass-"));
    const componentsDir = path.join(fixtureDir, "components");
    mkdirSync(componentsDir, { recursive: true });
    writeFileSync(
      path.join(fixtureDir, "tsconfig.json"),
      JSON.stringify({
        compilerOptions: {
          target: "ES2022",
          module: "ESNext",
          jsx: "react-jsx",
          strict: true,
        },
      }),
    );
    const sourcePath = path.join(componentsDir, "typed.tsx");
    writeFileSync(
      sourcePath,
      [
        'import styled from "styled-components";',
        "",
        "type SxStyles = { readonly __stylex?: string };",
        "interface BaseProps { inherited?: boolean }",
        "interface ButtonBaseProps extends BaseProps { baseOnly?: string }",
        "type VariantProps = { tone?: 'primary' | 'secondary'; sx?: SxStyles };",
        "type ButtonProps<T extends string = 'button'> = ButtonBaseProps & VariantProps & { as?: T; requiredCount: number };",
        "",
        "export const Button = styled.button<ButtonProps>`color: red;`;",
        "",
        "export function Inherited(props: ButtonBaseProps) {",
        "  return <div>{props.baseOnly}</div>;",
        "}",
        "",
        "export function Panel<T extends string>(props: ButtonProps<T> & { label: T }) {",
        "  const { tone, ...rest } = props;",
        "  return <div {...rest}>{props.label}</div>;",
        "}",
        "",
        "export const Card = <T extends string = 'section',>({ sx, ...rest }: ButtonProps<T>) => <section {...rest} />;",
        "",
        "export function BodySx(props: { label: string }) {",
        "  const { sx, label } = props as { sx?: SxStyles; label: string };",
        "  return <div>{label}{sx ? 'sx' : ''}</div>;",
        "}",
        "",
        "const DefaultAlias = (props: { sx?: SxStyles }) => <div>{props.sx ? 'sx' : ''}</div>;",
        "export default DefaultAlias;",
        "",
        "export const MemoSx = React.memo((props: { sx?: SxStyles; label?: string }) => <div>{props.label}</div>);",
        "function InnerMemoSx(props: { sx?: SxStyles; label?: string }) {",
        "  return <div>{props.label}</div>;",
        "}",
        "export const MemoIdentifierSx = React.memo(InnerMemoSx);",
        "export const ForwardRefSx = React.forwardRef<HTMLDivElement, { sx?: SxStyles; label?: string }>((props, ref) => <div ref={ref}>{props.label}</div>);",
        "",
        "interface InheritedSxProps extends VariantProps { label?: string }",
        "export function InheritedSx(props: InheritedSxProps) {",
        "  return <div>{props.label}</div>;",
        "}",
        "",
        "export function ShadowedProps(props: { items: Array<{ sx?: SxStyles }> }) {",
        "  return <div>{props.items.map((props) => props.sx ? 'sx' : '')}</div>;",
        "}",
        "",
        "type MappedSxProps = Pick<VariantProps, 'sx'> & { label?: string };",
        "export function MappedSx(props: MappedSxProps) {",
        "  return <div>{props.label}</div>;",
        "}",
      ].join("\n"),
    );

    try {
      const prepassResult = await runPrepass({
        filesToTransform: [sourcePath],
        consumerPaths: [],
        resolver: createModuleResolver(),
        parserName: "tsx",
        createExternalInterface: false,
      });

      expect(prepassResult.typeScriptMetadata).toBeDefined();
      expect(JSON.parse(JSON.stringify(prepassResult.typeScriptMetadata))).toEqual(
        prepassResult.typeScriptMetadata,
      );
      expect(
        prepassResult.typeScriptMetadata!.files[0]!.components.find(
          (component) => component.name === "BodySx",
        )?.supportsSxProp,
      ).toBe(true);
      expect(
        prepassResult.typeScriptMetadata!.files[0]!.components.find(
          (component) => component.name === "DefaultAlias",
        )?.defaultExport,
      ).toBe(true);
      expect(
        prepassResult.typeScriptMetadata!.files[0]!.components.find(
          (component) => component.name === "MemoSx",
        )?.supportsSxProp,
      ).toBe(true);
      expect(
        prepassResult.typeScriptMetadata!.files[0]!.components.find(
          (component) => component.name === "MemoIdentifierSx",
        )?.supportsSxProp,
      ).toBe(true);
      expect(
        prepassResult.typeScriptMetadata!.files[0]!.components.find(
          (component) => component.name === "ForwardRefSx",
        )?.supportsSxProp,
      ).toBe(true);
      expect(
        prepassResult.typeScriptMetadata!.files[0]!.components.find(
          (component) => component.name === "InheritedSx",
        )?.supportsSxProp,
      ).toBe(true);
      expect(
        prepassResult.typeScriptMetadata!.files[0]!.components.find(
          (component) => component.name === "ShadowedProps",
        )?.supportsSxProp,
      ).toBe(false);
      expect(
        prepassResult.typeScriptMetadata!.files[0]!.components.find(
          (component) => component.name === "MappedSx",
        )?.supportsSxProp,
      ).toBe(true);
      expect(componentSnapshot(prepassResult.typeScriptMetadata!, fixtureDir))
        .toMatchInlineSnapshot(`
          {
            "components/typed.tsx:Button": {
              "exported": true,
              "kind": "styled",
              "parameters": [],
              "propType": {
                "inheritedTypes": [],
                "intersectionTypes": [
                  "ButtonBaseProps",
                  "VariantProps",
                  "{ as?: T; requiredCount: number }",
                ],
                "text": "ButtonProps",
                "unionTypes": [],
              },
              "props": [
                {
                  "name": "as",
                  "optional": true,
                  "readonly": false,
                  "type": "T | undefined",
                },
                {
                  "name": "baseOnly",
                  "optional": true,
                  "readonly": false,
                  "type": "string | undefined",
                },
                {
                  "name": "inherited",
                  "optional": true,
                  "readonly": false,
                  "type": "boolean | undefined",
                },
                {
                  "name": "requiredCount",
                  "optional": false,
                  "readonly": false,
                  "type": "number",
                },
                {
                  "name": "sx",
                  "optional": true,
                  "readonly": false,
                  "type": "SxStyles | undefined",
                },
                {
                  "name": "tone",
                  "optional": true,
                  "readonly": false,
                  "type": "'primary' | 'secondary' | undefined",
                },
              ],
              "restProps": [],
              "supportsSxProp": true,
              "typeParameters": [],
            },
            "components/typed.tsx:Card": {
              "exported": true,
              "kind": "react",
              "parameters": [
                {
                  "name": "{ sx, ...rest }",
                  "optional": false,
                  "rest": false,
                  "type": "ButtonProps<T>",
                },
              ],
              "propType": {
                "inheritedTypes": [],
                "intersectionTypes": [
                  "ButtonBaseProps",
                  "VariantProps",
                  "{ as?: T; requiredCount: number }",
                ],
                "text": "ButtonProps<T>",
                "unionTypes": [],
              },
              "props": [
                {
                  "name": "as",
                  "optional": true,
                  "readonly": false,
                  "type": "T | undefined",
                },
                {
                  "name": "baseOnly",
                  "optional": true,
                  "readonly": false,
                  "type": "string | undefined",
                },
                {
                  "name": "inherited",
                  "optional": true,
                  "readonly": false,
                  "type": "boolean | undefined",
                },
                {
                  "name": "requiredCount",
                  "optional": false,
                  "readonly": false,
                  "type": "number",
                },
                {
                  "name": "sx",
                  "optional": true,
                  "readonly": false,
                  "type": "SxStyles | undefined",
                },
                {
                  "name": "tone",
                  "optional": true,
                  "readonly": false,
                  "type": "'primary' | 'secondary' | undefined",
                },
              ],
              "restProps": [
                {
                  "name": "rest",
                  "source": "parameter",
                },
              ],
              "supportsSxProp": true,
              "typeParameters": [
                "T extends string = 'section'",
              ],
            },
            "components/typed.tsx:Inherited": {
              "exported": true,
              "kind": "react",
              "parameters": [
                {
                  "name": "props",
                  "optional": false,
                  "rest": false,
                  "type": "ButtonBaseProps",
                },
              ],
              "propType": {
                "inheritedTypes": [
                  "BaseProps",
                ],
                "intersectionTypes": [],
                "text": "ButtonBaseProps",
                "unionTypes": [],
              },
              "props": [
                {
                  "name": "baseOnly",
                  "optional": true,
                  "readonly": false,
                  "type": "string | undefined",
                },
                {
                  "name": "inherited",
                  "optional": true,
                  "readonly": false,
                  "type": "boolean | undefined",
                },
              ],
              "restProps": [],
              "supportsSxProp": false,
              "typeParameters": [],
            },
            "components/typed.tsx:Panel": {
              "exported": true,
              "kind": "react",
              "parameters": [
                {
                  "name": "props",
                  "optional": false,
                  "rest": false,
                  "type": "ButtonProps<T> & { label: T }",
                },
              ],
              "propType": {
                "inheritedTypes": [],
                "intersectionTypes": [
                  "ButtonProps<T>",
                  "{ label: T }",
                ],
                "text": "ButtonProps<T> & { label: T }",
                "unionTypes": [],
              },
              "props": [
                {
                  "name": "as",
                  "optional": true,
                  "readonly": false,
                  "type": "T | undefined",
                },
                {
                  "name": "baseOnly",
                  "optional": true,
                  "readonly": false,
                  "type": "string | undefined",
                },
                {
                  "name": "inherited",
                  "optional": true,
                  "readonly": false,
                  "type": "boolean | undefined",
                },
                {
                  "name": "label",
                  "optional": false,
                  "readonly": false,
                  "type": "T",
                },
                {
                  "name": "requiredCount",
                  "optional": false,
                  "readonly": false,
                  "type": "number",
                },
                {
                  "name": "sx",
                  "optional": true,
                  "readonly": false,
                  "type": "SxStyles | undefined",
                },
                {
                  "name": "tone",
                  "optional": true,
                  "readonly": false,
                  "type": "'primary' | 'secondary' | undefined",
                },
              ],
              "restProps": [
                {
                  "name": "rest",
                  "source": "destructure",
                },
              ],
              "supportsSxProp": true,
              "typeParameters": [
                "T extends string",
              ],
            },
          }
        `);
    } finally {
      rmSync(fixtureDir, { recursive: true, force: true });
    }
  });

  it("does not run for non-TypeScript parsers", async () => {
    const fixtureDir = mkdtempSync(path.join(tmpdir(), "typescript-prepass-off-"));
    const sourcePath = path.join(fixtureDir, "component.tsx");
    writeFileSync(
      sourcePath,
      'import styled from "styled-components";\nexport const Button = styled.button<{ sx?: unknown }>`color: red;`;',
    );

    try {
      const prepassResult = await runPrepass({
        filesToTransform: [sourcePath],
        consumerPaths: [],
        resolver: createModuleResolver(),
        parserName: "babel",
        createExternalInterface: false,
      });

      expect(prepassResult.typeScriptMetadata).toBeUndefined();
    } finally {
      rmSync(fixtureDir, { recursive: true, force: true });
    }
  });

  it("analyzes compiler metadata for transformed intrinsic styled components", async () => {
    const fixtureDir = mkdtempSync(path.join(tmpdir(), "typescript-prepass-transformed-root-"));
    const sourcePath = path.join(fixtureDir, "component.tsx");
    writeFileSync(
      sourcePath,
      [
        'import styled from "styled-components";',
        "export const Label = styled.div`color: red;`;",
      ].join("\n"),
    );

    try {
      const prepassResult = await runPrepass({
        filesToTransform: [sourcePath],
        consumerPaths: [],
        resolver: createModuleResolver(),
        parserName: "tsx",
        createExternalInterface: false,
      });

      expect(
        prepassResult.typeScriptMetadata?.files.map((file) =>
          path.relative(realpathSync(fixtureDir), file.filePath),
        ),
      ).toEqual(["component.tsx"]);
      expect(
        findTypeScriptComponentMetadata(prepassResult.typeScriptMetadata, sourcePath, ["Label"]),
      ).toMatchObject({
        kind: "styled",
        supportsSxProp: false,
      });
    } finally {
      rmSync(fixtureDir, { recursive: true, force: true });
    }
  });

  it("limits TypeScript metadata roots to transformed styled wrappers", async () => {
    const fixtureDir = mkdtempSync(path.join(tmpdir(), "typescript-prepass-roots-"));
    writeFileSync(
      path.join(fixtureDir, "tsconfig.json"),
      JSON.stringify({ compilerOptions: { jsx: "react-jsx", moduleResolution: "node" } }),
    );

    const basePath = path.join(fixtureDir, "base.tsx");
    const otherPath = path.join(fixtureDir, "other.tsx");
    const targetPath = path.join(fixtureDir, "target.tsx");
    const consumerPath = path.join(fixtureDir, "consumer.tsx");
    writeFileSync(
      basePath,
      [
        "export function Base(props: { sx?: unknown; label?: string }) {",
        "  return <div>{props.label}</div>;",
        "}",
      ].join("\n"),
    );
    writeFileSync(
      otherPath,
      [
        "export function Other(props: { sx?: unknown; label?: string }) {",
        "  return <div>{props.label}</div>;",
        "}",
      ].join("\n"),
    );
    writeFileSync(
      targetPath,
      [
        'import styled from "styled-components";',
        'import { Base } from "./base";',
        "export const WrappedBase = styled(Base)`color: red;`;",
      ].join("\n"),
    );
    writeFileSync(
      consumerPath,
      [
        'import styled from "styled-components";',
        'import { Other } from "./other";',
        "export const WrappedOther = styled(Other)`color: blue;`;",
      ].join("\n"),
    );

    try {
      const realFixtureDir = realpathSync(fixtureDir);
      const prepassResult = await runPrepass({
        filesToTransform: [targetPath],
        consumerPaths: [consumerPath],
        resolver: createModuleResolver(),
        parserName: "tsx",
        createExternalInterface: true,
      });

      expect(
        prepassResult.typeScriptMetadata?.files.map((file) =>
          path.relative(realFixtureDir, file.filePath),
        ),
      ).toEqual(["base.tsx", "target.tsx"]);
      expect(prepassResult.consumerAnalysis?.get(`${realpathSync(otherPath)}:Other`)?.styles).toBe(
        true,
      );
    } finally {
      rmSync(fixtureDir, { recursive: true, force: true });
    }
  });

  it("extracts sx support from anonymous default function components", async () => {
    const fixtureDir = mkdtempSync(path.join(tmpdir(), "typescript-prepass-default-fn-"));
    const sourcePath = path.join(fixtureDir, "component.tsx");
    writeFileSync(
      sourcePath,
      [
        "type SxStyles = { readonly __stylex?: string };",
        "export default function(props: { sx?: SxStyles; label?: string }) {",
        "  return <div>{props.label}</div>;",
        "}",
      ].join("\n"),
    );

    try {
      const prepassResult = await runPrepass({
        filesToTransform: [sourcePath],
        consumerPaths: [],
        resolver: createModuleResolver(),
        parserName: "tsx",
        createExternalInterface: false,
      });
      const anonymousDefault = prepassResult.typeScriptMetadata?.files[0]?.components.find(
        (component) => component.name === "default",
      );

      expect(anonymousDefault?.defaultExport).toBe(true);
      expect(anonymousDefault?.supportsSxProp).toBe(true);
    } finally {
      rmSync(fixtureDir, { recursive: true, force: true });
    }
  });

  it("runTransform accepts non-TypeScript parsers without TypeScript metadata", async () => {
    const result = await runTransform({
      files: "src/__tests__/fixtures/cross-file/no-styled.tsx",
      consumerPaths: null,
      parser: "babel",
      adapter: {
        resolveValue: () => undefined,
        resolveCall: () => undefined,
        resolveSelector: () => undefined,
        externalInterface: () => ({ styles: false, as: false, ref: false }),
        styleMerger: null,
        useSxProp: false,
        usePhysicalProperties: true,
      },
      dryRun: true,
      silent: true,
    });
    expect(result.errors).toBe(0);
  });
});

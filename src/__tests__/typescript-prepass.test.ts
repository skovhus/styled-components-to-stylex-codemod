import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { createModuleResolver } from "../internal/prepass/resolve-imports.js";
import { runPrepass } from "../internal/prepass/run-prepass.js";
import {
  findTypeScriptComponentMetadata,
  type TypeScriptPrepassMetadata,
} from "../internal/prepass/typescript-analysis.js";
import { runTransform } from "../run.js";

function componentSnapshot(metadata: TypeScriptPrepassMetadata, baseDir: string) {
  const realBase = realpathSync(baseDir);
  return Object.fromEntries(
    metadata.files.flatMap((file) =>
      file.components
        .filter((component) => component.name !== "BodySx" && component.name !== "DefaultAlias")
        .filter((component) => component.name !== "MemoSx" && component.name !== "ForwardRefSx")
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
        "export const ForwardRefSx = React.forwardRef<HTMLDivElement, { sx?: SxStyles; label?: string }>((props, ref) => <div ref={ref}>{props.label}</div>);",
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
          (component) => component.name === "ForwardRefSx",
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
                "type": ""button" | undefined",
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
                "type": ""primary" | "secondary" | undefined",
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
                "type": ""primary" | "secondary" | undefined",
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
                "type": ""primary" | "secondary" | undefined",
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
      },
      dryRun: true,
      silent: true,
    });
    expect(result.errors).toBe(0);
  });
});

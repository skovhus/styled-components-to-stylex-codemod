import { describe, expect, it } from "vitest";
import jscodeshift from "jscodeshift";
import type { StyledDecl } from "../transform-types.js";
import type { TransformContext } from "../transform-context.js";
import { guardForwardedSxConditionalDefaults } from "./forwarded-sx-defaults.js";

const j = jscodeshift.withParser("tsx");

describe("guardForwardedSxConditionalDefaults", () => {
  it("patches variant dimension defaults forwarded through sx", () => {
    const basePath = "/tmp/base.tsx";
    const variantStyle = {
      display: {
        default: null,
        "@media print": "block",
      },
    };
    const decl = {
      localName: "PrintBox",
      styleKey: "printBox",
      base: { kind: "component", ident: "Base" },
      rules: [],
      templateExpressions: [],
      variantDimensions: [
        {
          propName: "tone",
          variantObjectName: "toneVariants",
          variants: {
            print: variantStyle,
          },
        },
      ],
    } satisfies StyledDecl;
    const ctx = {
      adapter: {
        useSxProp: true,
        wrappedComponentInterface: () => ({ acceptsSx: true }),
      },
      api: { jscodeshift: j },
      file: { path: "/tmp/wrapper.tsx", source: "" },
      importMap: new Map([
        [
          "Base",
          {
            importedName: "Base",
            source: { kind: "absolutePath", value: basePath },
          },
        ],
      ]),
      options: {
        transformedFileSources: new Map([
          [
            basePath,
            `
              import * as stylex from "@stylexjs/stylex";
              export function Base({ sx, ...rest }) {
                return <div {...rest} sx={[styles.base, sx]} />;
              }
              const styles = stylex.create({
                base: { display: "flex" },
              });
            `,
          ],
        ]),
      },
      resolvedStyleObjects: new Map([["printBox", {}]]),
      warnings: [],
    } as unknown as TransformContext;

    expect(guardForwardedSxConditionalDefaults(ctx, [decl])).toBe("ok");
    expect(variantStyle).toEqual({
      display: {
        default: "flex",
        "@media print": "block",
      },
    });
  });
});

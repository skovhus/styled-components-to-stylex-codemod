import { describe, expect, it } from "vitest";
import jscodeshift from "jscodeshift";
import type { StyledDecl } from "../transform-types.js";
import type { TransformContext } from "../transform-context.js";
import { guardForwardedSxConditionalDefaults } from "./forwarded-sx-defaults.js";

const j = jscodeshift.withParser("tsx");

describe("guardForwardedSxConditionalDefaults", () => {
  it("allows conditional computed maps that omit the checked property", () => {
    const styleObj = backgroundHoverStyle();
    const ctx = forwardedSxContext({
      styleObj,
      importSource: { kind: "specifier", value: "@scope/base" },
      resolveModule: () => "/tmp/base.tsx",
      baseSource: `
        import * as stylex from "@stylexjs/stylex";
        export function Base({ sx, align, ...rest }) {
          return <div {...rest} sx={[styles.base, align != null && alignVariants[align], sx]} />;
        }
        const styles = stylex.create({
          base: { display: "flex" },
        });
        const alignVariants = stylex.create({
          start: { alignItems: "flex-start" },
          center: { alignItems: "center" },
        });
      `,
    });

    expect(guardForwardedSxConditionalDefaults(ctx, [styledDecl()])).toBe("ok");
    expect(ctx.warnings).toEqual([]);
    expect(styleObj.backgroundColor).toEqual({
      default: null,
      ":hover": "rgb(1, 2, 3)",
    });
  });

  it("bails when a conditional computed map can contribute the checked property", () => {
    const ctx = forwardedSxContext({
      styleObj: backgroundHoverStyle(),
      baseSource: `
        import * as stylex from "@stylexjs/stylex";
        export function Base({ sx, tone, ...rest }) {
          return <div {...rest} sx={[styles.base, tone != null && toneVariants[tone], sx]} />;
        }
        const styles = stylex.create({
          base: { display: "flex" },
        });
        const toneVariants = stylex.create({
          neutral: { color: "black" },
          warning: { backgroundColor: "yellow" },
        });
      `,
    });

    expect(guardForwardedSxConditionalDefaults(ctx, [styledDecl()])).toBe("bail");
    expect(ctx.warnings).toHaveLength(1);
    expect(ctx.warnings[0]?.type).toBe(
      "Forwarded sx conditional default would override an unproven wrapped component base style",
    );
  });

  it("bails when nonliteral computed map entries all share a static property", () => {
    const ctx = forwardedSxContext({
      styleObj: backgroundHoverStyle(),
      baseSource: `
        import * as stylex from "@stylexjs/stylex";
        export function Base({ sx, tone, ...rest }) {
          return <div {...rest} sx={[toneVariants[tone], sx]} />;
        }
        const toneVariants = stylex.create({
          neutral: { backgroundColor: "white" },
          warning: { backgroundColor: "white" },
        });
      `,
    });

    expect(guardForwardedSxConditionalDefaults(ctx, [styledDecl()])).toBe("bail");
    expect(ctx.warnings).toHaveLength(1);
  });

  it("patches defaults from exact computed style keys with static properties", () => {
    const styleObj = backgroundHoverStyle();
    const ctx = forwardedSxContext({
      styleObj,
      baseSource: `
        import * as stylex from "@stylexjs/stylex";
        export function Base({ sx, ...rest }) {
          return <div {...rest} sx={[toneVariants["neutral"], sx]} />;
        }
        const toneVariants = stylex.create({
          neutral: { backgroundColor: "white" },
          warning: { backgroundColor: "yellow" },
        });
      `,
    });

    expect(guardForwardedSxConditionalDefaults(ctx, [styledDecl()])).toBe("ok");
    expect(ctx.warnings).toEqual([]);
    expect(styleObj.backgroundColor).toEqual({
      default: "white",
      ":hover": "rgb(1, 2, 3)",
    });
  });

  it("bails when computed maps include unread spread entries", () => {
    const ctx = forwardedSxContext({
      styleObj: backgroundHoverStyle(),
      baseSource: `
        import * as stylex from "@stylexjs/stylex";
        const sharedVariants = {
          danger: { backgroundColor: "red" },
        };
        export function Base({ sx, tone, ...rest }) {
          return <div {...rest} sx={[toneVariants[tone], sx]} />;
        }
        const toneVariants = stylex.create({
          ...sharedVariants,
          neutral: { color: "black" },
        });
      `,
    });

    expect(guardForwardedSxConditionalDefaults(ctx, [styledDecl()])).toBe("bail");
    expect(ctx.warnings[0]?.type).toBe(
      "Forwarded sx conditional default would override an unproven wrapped component base style",
    );
  });

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

  it("lifts flat sx color for a static Button-like borderless variant", () => {
    const styleObj = { color: "muted" };
    const ctx = forwardedSxContext({
      styleObj,
      baseSource: buttonLikeBaseSource(),
    });

    expect(guardForwardedSxConditionalDefaults(ctx, [styledDecl({ variant: "borderless" })])).toBe(
      "ok",
    );
    expect(ctx.warnings).toEqual([]);
    expect(styleObj).toEqual({
      color: {
        default: "muted",
        ":highlightMixin": "title",
      },
    });
  });

  it("bails when Button-like variant is dynamic and flat sx color could erase states", () => {
    const ctx = forwardedSxContext({
      styleObj: { color: "muted" },
      baseSource: buttonLikeBaseSource(),
    });

    expect(guardForwardedSxConditionalDefaults(ctx, [styledDecl()])).toBe("bail");
    expect(ctx.warnings[0]?.type).toBe(
      "Flat StyleX value would erase earlier conditional property states",
    );
    expect(ctx.warnings[0]?.context?.property).toBe("color");
  });

  it("preserves existing caller conditional color maps", () => {
    const styleObj = {
      color: {
        default: "muted",
        ":highlightMixin": "title",
      },
    };
    const ctx = forwardedSxContext({
      styleObj,
      baseSource: buttonLikeBaseSource(),
    });

    expect(guardForwardedSxConditionalDefaults(ctx, [styledDecl({ variant: "borderless" })])).toBe(
      "ok",
    );
    expect(ctx.warnings).toEqual([]);
    expect(styleObj).toEqual({
      color: {
        default: "muted",
        ":highlightMixin": "title",
      },
    });
  });

  it("lifts generic non-color flat sx values over wrapped conditional maps", () => {
    const styleObj = { opacity: 0.8 };
    const ctx = forwardedSxContext({
      styleObj,
      baseSource: `
        import * as stylex from "@stylexjs/stylex";
        export function Base({ sx, ...rest }) {
          return <div {...rest} sx={[styles.base, sx]} />;
        }
        const styles = stylex.create({
          base: {
            opacity: { default: 1, ":hover": 0.5 },
          },
        });
      `,
    });

    expect(guardForwardedSxConditionalDefaults(ctx, [styledDecl()])).toBe("ok");
    expect(styleObj).toEqual({
      opacity: {
        default: 0.8,
        ":hover": 0.5,
      },
    });
  });

  it("lifts transitionDuration over wrapped highlight duration states", () => {
    const styleObj = { transitionDuration: "120ms" };
    const ctx = forwardedSxContext({
      styleObj,
      baseSource: `
        import * as stylex from "@stylexjs/stylex";
        export function Base({ sx, ...rest }) {
          return <div {...rest} sx={[styles.base, sx]} />;
        }
        const styles = stylex.create({
          base: {
            transitionProperty: "color",
            transitionDuration: { default: "120ms", ":highlightMixin": "80ms" },
          },
        });
      `,
    });

    expect(guardForwardedSxConditionalDefaults(ctx, [styledDecl()])).toBe("ok");
    expect(styleObj).toEqual({
      transitionDuration: {
        default: "120ms",
        ":highlightMixin": "80ms",
      },
    });
  });
});

function backgroundHoverStyle(): Record<string, unknown> {
  return {
    backgroundColor: {
      default: null,
      ":hover": "rgb(1, 2, 3)",
    },
  };
}

function styledDecl(staticAttrs?: Record<string, unknown>): StyledDecl {
  return {
    localName: "Container",
    styleKey: "container",
    base: { kind: "component", ident: "Base" },
    rules: [],
    templateExpressions: [],
    ...(staticAttrs
      ? {
          attrsInfo: {
            staticAttrs,
            conditionalAttrs: [],
          },
        }
      : {}),
  } satisfies StyledDecl;
}

function buttonLikeBaseSource(): string {
  return `
    import * as stylex from "@stylexjs/stylex";

    export function Base(props) {
      const { sx, variant = "primary", ...rest } = props;
      return <button {...rest} sx={[...getButtonMixinStyles({ variant }), sx]} />;
    }

    export function getButtonMixinStyles({ variant }) {
      return [buttonVariants[variant]];
    }

    const buttonVariants = stylex.create({
      primary: { color: "control" },
      borderless: {
        color: {
          default: "base",
          ":highlightMixin": "title",
        },
      },
    });
  `;
}

function forwardedSxContext(args: {
  baseSource: string;
  styleObj: Record<string, unknown>;
  importSource?: { kind: "absolutePath" | "specifier"; value: string };
  resolveModule?: (fromFile: string, specifier: string) => string | undefined;
}): TransformContext {
  const basePath = "/tmp/base.tsx";
  return {
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
          source: args.importSource ?? { kind: "absolutePath", value: basePath },
        },
      ],
    ]),
    options: {
      transformedFileSources: new Map([[basePath, args.baseSource]]),
      ...(args.resolveModule ? { resolveModule: args.resolveModule } : {}),
    },
    resolvedStyleObjects: new Map([["container", args.styleObj]]),
    warnings: [],
  } as unknown as TransformContext;
}

import { describe, expect, it } from "vitest";
import { resolve as pathResolve } from "node:path";
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

  it("does not read unresolved bare specifiers as local files", () => {
    const styleObj = { color: "muted" };
    const ctx = forwardedSxContext({
      styleObj,
      importSource: { kind: "specifier", value: "Button" },
      transformedFileSources: new Map([[pathResolve("Button"), buttonLikeBaseSource()]]),
      baseSource: "",
    });

    expect(guardForwardedSxConditionalDefaults(ctx, [styledDecl({ variant: "borderless" })])).toBe(
      "ok",
    );
    expect(ctx.warnings).toEqual([]);
    expect(styleObj).toEqual({ color: "muted" });
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

  it("bails when computed maps include unread inline entry spreads", () => {
    const ctx = forwardedSxContext({
      styleObj: backgroundHoverStyle(),
      baseSource: `
        import * as stylex from "@stylexjs/stylex";
        const dangerVariant = { backgroundColor: "red" };
        export function Base({ sx, tone, ...rest }) {
          return <div {...rest} sx={[toneVariants[tone], sx]} />;
        }
        const toneVariants = stylex.create({
          danger: { ...dangerVariant },
          neutral: { color: "black" },
        });
      `,
    });

    expect(guardForwardedSxConditionalDefaults(ctx, [styledDecl()])).toBe("bail");
    expect(ctx.warnings[0]?.type).toBe(
      "Forwarded sx conditional default would override an unproven wrapped component base style",
    );
  });

  it("bails when computed maps include unread entry values", () => {
    const ctx = forwardedSxContext({
      styleObj: backgroundHoverStyle(),
      baseSource: `
        import * as stylex from "@stylexjs/stylex";
        const dangerVariant = { backgroundColor: "red" };
        export function Base({ sx, tone, ...rest }) {
          return <div {...rest} sx={[toneVariants[tone], sx]} />;
        }
        const toneVariants = stylex.create({
          danger: dangerVariant,
          neutral: { color: "black" },
        });
      `,
    });

    expect(guardForwardedSxConditionalDefaults(ctx, [styledDecl()])).toBe("bail");
    expect(ctx.warnings[0]?.type).toBe(
      "Forwarded sx conditional default would override an unproven wrapped component base style",
    );
  });

  it("does not reject exact style refs because sibling style entries are incomplete", () => {
    const styleObj = { color: "muted" };
    const ctx = forwardedSxContext({
      styleObj,
      baseSource: `
        import * as stylex from "@stylexjs/stylex";
        const sharedVariant = { color: { default: "shared", ":hover": "sharedHover" } };
        export function Base({ sx, ...rest }) {
          return <div {...rest} sx={[styles.base, sx]} />;
        }
        const styles = stylex.create({
          base: {
            color: {
              default: "base",
              ":hover": "hover",
            },
          },
          unused: sharedVariant,
        });
      `,
    });

    expect(guardForwardedSxConditionalDefaults(ctx, [styledDecl()])).toBe("ok");
    expect(ctx.warnings).toEqual([]);
    expect(styleObj).toEqual({
      color: {
        default: "muted",
        ":hover": "hover",
      },
    });
  });

  it("uses the module stylex.create binding instead of nested same-name maps", () => {
    const styleObj = { color: "muted" };
    const ctx = forwardedSxContext({
      styleObj,
      baseSource: `
        import * as stylex from "@stylexjs/stylex";
        export function Base({ sx, ...rest }) {
          return <div {...rest} sx={[styles.base, sx]} />;
        }
        const styles = stylex.create({
          base: {
            color: {
              default: "base",
              ":hover": "hover",
            },
          },
        });
        function helper() {
          const styles = stylex.create({
            base: {
              color: "nested",
            },
          });
          return styles.base;
        }
      `,
    });

    expect(guardForwardedSxConditionalDefaults(ctx, [styledDecl()])).toBe("ok");
    expect(ctx.warnings).toEqual([]);
    expect(styleObj).toEqual({
      color: {
        default: "muted",
        ":hover": "hover",
      },
    });
  });

  it("uses the module array-style helper binding instead of nested same-name helpers", () => {
    const styleObj = { color: "muted" };
    const ctx = forwardedSxContext({
      styleObj,
      baseSource: `
        import * as stylex from "@stylexjs/stylex";
        export function Base({ sx, ...rest }) {
          return <div {...rest} sx={[...getStyles(), sx]} />;
        }
        function getStyles() {
          return [styles.hover];
        }
        const styles = stylex.create({
          hover: {
            color: {
              default: "base",
              ":hover": "hover",
            },
          },
          flat: {
            color: "nested",
          },
        });
        function unrelated() {
          function getStyles() {
            return [styles.flat];
          }
          return getStyles();
        }
      `,
    });

    expect(guardForwardedSxConditionalDefaults(ctx, [styledDecl()])).toBe("ok");
    expect(ctx.warnings).toEqual([]);
    expect(styleObj).toEqual({
      color: {
        default: "muted",
        ":hover": "hover",
      },
    });
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

  it("bails when a later helper call spread can override a static variant", () => {
    const styleObj = { color: "muted" };
    const ctx = forwardedSxContext({
      styleObj,
      baseSource: `
        import * as stylex from "@stylexjs/stylex";

        export function Base(props) {
          const { sx, ...rest } = props;
          return <button {...rest} sx={[...getButtonMixinStyles({ variant: "borderless", ...props }), sx]} />;
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
      `,
    });

    expect(guardForwardedSxConditionalDefaults(ctx, [styledDecl()])).toBe("bail");
    expect(ctx.warnings[0]?.type).toBe(
      "Flat StyleX value would erase earlier conditional property states",
    );
    expect(styleObj).toEqual({ color: "muted" });
  });

  it("uses static helper call values declared after object spreads", () => {
    const styleObj = { color: "muted" };
    const ctx = forwardedSxContext({
      styleObj,
      baseSource: `
        import * as stylex from "@stylexjs/stylex";

        export function Base(props) {
          const { sx, ...rest } = props;
          return <button {...rest} sx={[...getButtonMixinStyles({ ...props, variant: "borderless" }), sx]} />;
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
      `,
    });

    expect(guardForwardedSxConditionalDefaults(ctx, [styledDecl()])).toBe("ok");
    expect(ctx.warnings).toEqual([]);
    expect(styleObj).toEqual({
      color: {
        default: "muted",
        ":highlightMixin": "title",
      },
    });
  });

  it("shadows outer static attrs when helper call omits a same-named param", () => {
    const styleObj = { color: "muted" };
    const ctx = forwardedSxContext({
      styleObj,
      baseSource: `
        import * as stylex from "@stylexjs/stylex";

        export function Base({ sx, ...rest }) {
          return <button {...rest} sx={[...getButtonMixinStyles({}), sx]} />;
        }

        export function getButtonMixinStyles({ active }) {
          return [active && styles.hover];
        }

        const styles = stylex.create({
          hover: {
            color: {
              default: "base",
              ":hover": "hover",
            },
          },
        });
      `,
    });

    expect(guardForwardedSxConditionalDefaults(ctx, [styledDecl({ active: true })])).toBe("bail");
    expect(ctx.warnings[0]?.type).toBe(
      "Flat StyleX value would erase earlier conditional property states",
    );
    expect(styleObj).toEqual({ color: "muted" });
  });

  it("does not bind static attrs through unrelated local object destructures", () => {
    const ctx = forwardedSxContext({
      styleObj: { color: "muted" },
      baseSource: `
        import * as stylex from "@stylexjs/stylex";

        export function Base(props) {
          const defaults = { variant: "primary" };
          const { sx, ...rest } = props;
          const { variant } = defaults;
          return <button {...rest} sx={[buttonVariants[variant], sx]} />;
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
      `,
    });

    expect(guardForwardedSxConditionalDefaults(ctx, [styledDecl({ variant: "borderless" })])).toBe(
      "bail",
    );
    expect(ctx.warnings[0]?.type).toBe(
      "Flat StyleX value would erase earlier conditional property states",
    );
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
    expect(ctx.warnings[0]?.context?.example).toContain("color: value");
    expect(ctx.warnings[0]?.context?.example).toContain('":hover"');
  });

  it("bails when flat sx overrides incomplete computed map entries", () => {
    const ctx = forwardedSxContext({
      styleObj: { color: "muted" },
      baseSource: `
        import * as stylex from "@stylexjs/stylex";
        const dangerVariant = { color: { default: "danger", ":hover": "dangerHover" } };
        export function Base({ sx, tone, ...rest }) {
          return <div {...rest} sx={[toneVariants[tone], sx]} />;
        }
        const toneVariants = stylex.create({
          danger: dangerVariant,
          neutral: { color: "base" },
        });
      `,
    });

    expect(guardForwardedSxConditionalDefaults(ctx, [styledDecl()])).toBe("bail");
    expect(ctx.warnings[0]?.type).toBe(
      "Flat StyleX value would erase earlier conditional property states",
    );
    expect(ctx.warnings[0]?.context?.property).toBe("color");
  });

  it("adds TODOs when an unknown style before sx could hide conditional states", () => {
    const styleObj = { marginBottom: 16, animationDuration: "0.3s" };
    const ctx = forwardedSxContext({
      styleObj,
      baseSource: `
        import * as stylex from "@stylexjs/stylex";
        export function Base({ sx, externalStyles, ...rest }) {
          return <div {...rest} sx={[externalStyles, sx]} />;
        }
      `,
    });

    expect(guardForwardedSxConditionalDefaults(ctx, [styledDecl()])).toBe("ok");
    expect(ctx.warnings).toEqual([]);
    expect(styleObj).toMatchObject({
      marginBottom: 16,
      animationDuration: "0.3s",
      __propComments: {
        marginBottom: {
          leadingLine: expect.stringContaining("flat marginBottom override is safe"),
        },
        animationDuration: {
          leadingLine: expect.stringContaining("flat animationDuration override is safe"),
        },
      },
    });
  });

  it("bails when a mutable local guard could hide conditional states", () => {
    const ctx = forwardedSxContext({
      styleObj: { color: "muted" },
      baseSource: `
        import * as stylex from "@stylexjs/stylex";
        export function Base(props) {
          const { sx, ...rest } = props;
          let active = false;
          active = props.active;
          return <div {...rest} sx={[active && styles.hover, sx]} />;
        }
        const styles = stylex.create({
          hover: {
            color: {
              default: "base",
              ":hover": "hover",
            },
          },
        });
      `,
    });

    expect(guardForwardedSxConditionalDefaults(ctx, [styledDecl()])).toBe("bail");
    expect(ctx.warnings[0]?.type).toBe(
      "Flat StyleX value would erase earlier conditional property states",
    );
    expect(ctx.warnings[0]?.context?.reason).toBe(
      "wrapped component base property can be conditional for this prop before sx is applied",
    );
    expect(ctx.warnings[0]?.context?.droppedConditionKeys).toBe(":hover");
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

  it("bails instead of flattening nested wrapped conditional map states", () => {
    const styleObj = { outlineWidth: 1 };
    const ctx = forwardedSxContext({
      styleObj,
      baseSource: `
        import * as stylex from "@stylexjs/stylex";
        export function Base({ sx, ...rest }) {
          return <div {...rest} sx={[styles.base, sx]} />;
        }
        const styles = stylex.create({
          base: {
            outlineWidth: {
              default: null,
              ":focus-visible": {
                default: null,
                "@media (forced-colors: active)": 2,
              },
            },
          },
        });
      `,
    });

    expect(guardForwardedSxConditionalDefaults(ctx, [styledDecl()])).toBe("bail");
    expect(ctx.warnings[0]?.type).toBe(
      "Flat StyleX value would erase earlier conditional property states",
    );
    expect(styleObj).toEqual({ outlineWidth: 1 });
  });

  it("bails when wrapped conditional maps include unread spreads", () => {
    const styleObj = { color: "muted" };
    const ctx = forwardedSxContext({
      styleObj,
      baseSource: `
        import * as stylex from "@stylexjs/stylex";
        const hoverStates = { ":hover": "hover" };
        export function Base({ sx, ...rest }) {
          return <div {...rest} sx={[styles.base, sx]} />;
        }
        const styles = stylex.create({
          base: {
            color: {
              default: "base",
              ...hoverStates,
            },
          },
        });
      `,
    });

    expect(guardForwardedSxConditionalDefaults(ctx, [styledDecl()])).toBe("bail");
    expect(ctx.warnings[0]?.type).toBe(
      "Flat StyleX value would erase earlier conditional property states",
    );
    expect(ctx.warnings[0]?.context?.reason).toBe(
      "wrapped component base property can be conditional for this prop before sx is applied",
    );
    expect(styleObj).toEqual({ color: "muted" });
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

  it("bails when a called style function can contribute conditional states", () => {
    const styleObj = { color: "muted" };
    const ctx = forwardedSxContext({
      styleObj,
      baseSource: `
        import * as stylex from "@stylexjs/stylex";
        export function Base({ sx, tone, ...rest }) {
          return <div {...rest} sx={[styles.dynamicColor(tone), sx]} />;
        }
        const styles = stylex.create({
          dynamicColor: (tone) => ({
            color: { default: tone, ":hover": "red" },
          }),
        });
      `,
    });

    expect(guardForwardedSxConditionalDefaults(ctx, [styledDecl()])).toBe("bail");
    expect(ctx.warnings[0]?.type).toBe(
      "Flat StyleX value would erase earlier conditional property states",
    );
    expect(ctx.warnings[0]?.context?.droppedConditionKeys).toBe(":hover");
    expect(styleObj).toEqual({ color: "muted" });
  });

  it("keeps flat-only style functions safe for flat sx overrides", () => {
    const styleObj = { color: "muted" };
    const ctx = forwardedSxContext({
      styleObj,
      baseSource: `
        import * as stylex from "@stylexjs/stylex";
        export function Base({ sx, tone, ...rest }) {
          return <div {...rest} sx={[styles.dynamicColor(tone), sx]} />;
        }
        const styles = stylex.create({
          dynamicColor: (tone) => ({
            color: tone,
          }),
        });
      `,
    });

    expect(guardForwardedSxConditionalDefaults(ctx, [styledDecl()])).toBe("ok");
    expect(ctx.warnings).toEqual([]);
    expect(styleObj).toEqual({ color: "muted" });
  });

  it("keeps scanning after flat-only variable styles before conditional maps", () => {
    const styleObj = { color: "muted" };
    const ctx = forwardedSxContext({
      styleObj,
      baseSource: `
        import * as stylex from "@stylexjs/stylex";
        export function Base({ sx, tone, ...rest }) {
          return <div {...rest} sx={[tone ? styles.red : styles.green, styles.hover, sx]} />;
        }
        const styles = stylex.create({
          red: { color: "red" },
          green: { color: "green" },
          hover: {
            color: {
              default: "base",
              ":hover": "hover",
            },
          },
        });
      `,
    });

    expect(guardForwardedSxConditionalDefaults(ctx, [styledDecl()])).toBe("ok");
    expect(ctx.warnings).toEqual([]);
    expect(styleObj).toEqual({
      color: {
        default: "muted",
        ":hover": "hover",
      },
    });
  });

  it("resolves module const property values into liftable conditional maps", () => {
    const styleObj = { color: "muted" };
    const ctx = forwardedSxContext({
      styleObj,
      baseSource: `
        import * as stylex from "@stylexjs/stylex";
        const hoverColorMap = { default: "base", ":hover": "hover" };
        export function Base({ sx, ...rest }) {
          return <div {...rest} sx={[styles.base, sx]} />;
        }
        const styles = stylex.create({
          base: { color: hoverColorMap },
        });
      `,
    });

    expect(guardForwardedSxConditionalDefaults(ctx, [styledDecl()])).toBe("ok");
    expect(ctx.warnings).toEqual([]);
    expect(styleObj).toEqual({
      color: { default: "muted", ":hover": "hover" },
    });
  });

  it("bails when property values reference identifiers it cannot resolve", () => {
    const styleObj = { color: "muted" };
    const ctx = forwardedSxContext({
      styleObj,
      baseSource: `
        import * as stylex from "@stylexjs/stylex";
        import { importedColorMap } from "./shared";
        export function Base({ sx, ...rest }) {
          return <div {...rest} sx={[styles.base, sx]} />;
        }
        const styles = stylex.create({
          base: { color: importedColorMap },
        });
      `,
    });

    expect(guardForwardedSxConditionalDefaults(ctx, [styledDecl()])).toBe("bail");
    expect(ctx.warnings[0]?.type).toBe(
      "Flat StyleX value would erase earlier conditional property states",
    );
    expect(styleObj).toEqual({ color: "muted" });
  });

  it("keeps token member expression values safe for flat sx overrides", () => {
    const styleObj = { color: "muted" };
    const ctx = forwardedSxContext({
      styleObj,
      baseSource: `
        import * as stylex from "@stylexjs/stylex";
        import { colors } from "./tokens.stylex";
        export function Base({ sx, ...rest }) {
          return <div {...rest} sx={[styles.base, sx]} />;
        }
        const styles = stylex.create({
          base: { color: colors.primary },
        });
      `,
    });

    expect(guardForwardedSxConditionalDefaults(ctx, [styledDecl()])).toBe("ok");
    expect(ctx.warnings).toEqual([]);
    expect(styleObj).toEqual({ color: "muted" });
  });

  it("bails when only one of several sx call sites contributes conditional states", () => {
    const styleObj = { color: "muted" };
    const ctx = forwardedSxContext({
      styleObj,
      baseSource: `
        import * as stylex from "@stylexjs/stylex";
        export function Base({ sx, ...rest }) {
          return (
            <div>
              <span sx={[sx]} />
              <div {...rest} sx={[styles.hover, sx]} />
            </div>
          );
        }
        const styles = stylex.create({
          hover: { color: { default: "base", ":hover": "hoverColor" } },
        });
      `,
    });

    expect(guardForwardedSxConditionalDefaults(ctx, [styledDecl()])).toBe("bail");
    expect(ctx.warnings[0]?.type).toBe(
      "Flat StyleX value would erase earlier conditional property states",
    );
    expect(ctx.warnings[0]?.context?.droppedConditionKeys).toBe(":hover");
    expect(styleObj).toEqual({ color: "muted" });
  });

  it("adds a TODO for cyclic const style bindings without hanging", () => {
    const styleObj = { color: "muted" };
    const ctx = forwardedSxContext({
      styleObj,
      baseSource: `
        import * as stylex from "@stylexjs/stylex";
        export function Base({ sx, ...rest }) {
          const first = second;
          const second = first;
          return <div {...rest} sx={[first, sx]} />;
        }
      `,
    });

    expect(guardForwardedSxConditionalDefaults(ctx, [styledDecl()])).toBe("ok");
    expect(ctx.warnings).toEqual([]);
    expect(styleObj).toMatchObject({
      color: "muted",
      __propComments: {
        color: {
          leadingLine: expect.stringContaining("flat color override is safe"),
        },
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
  transformedFileSources?: Map<string, string>;
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
          source: args.importSource ?? {
            kind: "absolutePath",
            value: basePath,
          },
        },
      ],
    ]),
    options: {
      transformedFileSources: new Map([
        [basePath, args.baseSource],
        ...(args.transformedFileSources?.entries() ?? []),
      ]),
      ...(args.resolveModule ? { resolveModule: args.resolveModule } : {}),
    },
    resolvedStyleObjects: new Map([["container", args.styleObj]]),
    warnings: [],
  } as unknown as TransformContext;
}

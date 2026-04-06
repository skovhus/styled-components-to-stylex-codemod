/**
 * Fixture adapters used by tests and e2e runs.
 * Core concepts: adapter hooks and test-specific resolution.
 */
import {
  type CallResolveContext,
  type CallResolveResult,
  defineAdapter,
  type ExternalInterfaceResult,
  type ImportSpec,
  type ResolveValueContext,
  type ResolveValueResult,
  type SelectorResolveContext,
  type SelectorResolveResult,
} from "../adapter.ts";

/* ── Shared import sources ──────────────────────────────────────────── */

const TOKENS = "./tokens.stylex";
const HELPERS_STYLEX = "./lib/helpers.stylex";

/** Build explicit ImportSpec — only needed for imperative resolvers or non-standard import names. */
const importSpec = (
  from: string,
  names: Array<{ imported: string; local?: string }>,
): ImportSpec[] => [{ from: { kind: "specifier", value: from }, names }];

/** Broad consumer props — shorthand for when all element-level flags are enabled. */
const BROAD_CONSUMER_PROPS = {
  className: true,
  style: true,
  elementProps: true,
  spreadProps: true,
} as const;

// Fixtures don't use theme resolution, but the transformer requires an adapter.
export const fixtureAdapter = defineAdapter({
  // Use mergedSx merger function for cleaner className/style merging output
  // See test-cases/lib/mergedSx.ts for the implementation
  styleMerger: {
    functionName: "mergedSx",
    importSource: { kind: "specifier", value: "./lib/mergedSx" },
  },

  // Emit sx={} JSX attributes instead of {...stylex.props()} spreads (StyleX ≥0.18)
  useSxProp: true,

  // Write all defineMarker() declarations to a single shared sidecar file
  markerFile: () => ({ kind: "specifier", value: "./markers.stylex" }),

  // Configure external interface for exported components
  externalInterface(ctx): ExternalInterfaceResult {
    // Enable external styles + polymorphic `as` prop for test cases that need both
    if (
      ["externalStyles-basic", "externalStyles-input"].some((filePath) =>
        ctx.filePath.includes(filePath),
      )
    ) {
      return { styles: true, as: true, ref: true, ...BROAD_CONSUMER_PROPS };
    }

    // Enable external styles only (no `as`) for test cases that only need className/style merging
    if (
      [
        "attrs-polymorphicAs",
        "attrs-tabIndex.",
        "basic-jsdocExported",
        "htmlProp-element",
        "wrapper-mergerImported",
        "htmlProp-input",
        "transientProp-notForwarded",
        "inlineBase-booleanVariantKey",
        "inlineBase-singletonBooleanWithTemplateExpr",
        "inlineBase-stringVariantExported",
      ].some((filePath) => ctx.filePath.includes(filePath))
    ) {
      return { styles: true, as: false, ref: false, ...BROAD_CONSUMER_PROPS };
    }

    // Enable styles + as to reproduce duplicate declaration bug
    if (ctx.filePath.includes("naming-duplicateDeclaration")) {
      return { styles: true, as: true, ref: true, ...BROAD_CONSUMER_PROPS };
    }

    // wrapper-propsIncomplete - TextColor and ThemeText should extend HTMLAttributes
    // Highlight wraps a component and shouldn't support external styles
    if (ctx.filePath.includes("wrapper-propsIncomplete")) {
      if (ctx.componentName === "TextColor" || ctx.componentName === "ThemeText") {
        return { styles: true, as: false, ref: false, ...BROAD_CONSUMER_PROPS };
      }
    }

    // Enable `as` prop support (without styles) for exported components in selected fixtures.
    if (
      ["asProp-exported", "asProp-crossFile"].some((filePath) => ctx.filePath.includes(filePath))
    ) {
      return { styles: false, as: true, ref: false };
    }

    // Narrow type test: only className, no style/elementProps/spread
    if (ctx.filePath.includes("naming-narrowType")) {
      return {
        styles: true,
        as: false,
        ref: false,
        className: true,
        style: false,
        elementProps: false,
        spreadProps: false,
      };
    }

    // Element props only test: consumer passes onClick but no spread
    // Tests P1 fix: ?? vs || operator - elementProps should enable intrinsic props
    if (ctx.filePath.includes("naming-elementPropsOnly")) {
      return {
        styles: true,
        as: false,
        ref: false,
        className: false,
        style: false,
        elementProps: true,
        spreadProps: false,
      };
    }

    return { styles: false, as: false, ref: false };
  },

  resolveBaseComponent(ctx) {
    if (
      !isInlineBaseFlexSource(ctx.importSource) ||
      ctx.importedName !== INLINE_BASE_FLEX_IMPORTED_NAME
    ) {
      return undefined;
    }

    const tagName = typeof ctx.staticProps.as === "string" ? ctx.staticProps.as : "div";
    const sx = resolveInlineBaseFlexSx(ctx.staticProps);
    const consumedProps = [...INLINE_BASE_FLEX_CONSUMED_PROPS];

    if (ctx.staticProps.direction === "row") {
      const sxWithoutBaseFlex = stripInlineBaseFlexBaseStyles(sx, ctx.staticProps);
      return {
        tagName,
        consumedProps,
        ...(Object.keys(sxWithoutBaseFlex).length > 0 ? { sx: sxWithoutBaseFlex } : {}),
        mixins: [
          {
            importSource: "./lib/mixins.stylex",
            importName: "mixins",
            styleKey: "flex",
          },
        ],
      };
    }

    return {
      tagName,
      consumedProps,
      sx,
    };
  },

  // Declarative theme mapping — first match wins.
  themeMapping: [
    // Shorthand expansion: theme.inputPadding + CSS "padding" → paddingBlock/paddingInline
    [
      "inputPadding",
      {
        directional: [
          { prop: "paddingBlock", expr: "$input.inputPaddingBlock", importFrom: TOKENS },
          { prop: "paddingInline", expr: "$input.inputPaddingInline", importFrom: TOKENS },
        ],
        cssProperties: ["padding"],
      },
    ],
    // Bail: baseTheme.* is not resolvable to static tokens
    ["baseTheme.*", { bail: true }],
    // Indexed lookup → props-map: theme.color[prop] for a known CSS property
    [
      "color",
      {
        indexed: true,
        usage: "props",
        dynamicArgUsage: "memberAccess",
        expr: "$colorMixins.{cssProperty}",
        importFrom: "./lib/colorMixins.stylex",
      },
    ],
    // Object-level: theme.color → $colors
    ["color", { expr: "$colors", importFrom: TOKENS }],
    // Catch-all: theme.X.Y → $colors.Y (uses last segment as property)
    ["*", { expr: "$colors.{property}", importFrom: TOKENS }],
  ],

  // Declarative CSS variable mapping.
  cssVariableMapping: [
    [
      "--base-size",
      { expr: "calcVars.baseSize", importFrom: "./css-calc.stylex", dropDefinition: "16px" },
    ],
    ["--font-weight-medium", { expr: "fontWeightVars.medium", importFrom: TOKENS }],
    // Function-based wildcard: --color-* → vars.{camelCase}
    ["--color-*", (name) => ({ expr: `vars.${name}`, importFrom: "./css-variables.stylex" })],
    // Individual spacing/border entries (not wildcarded — other --spacing-* vars are unmapped)
    ["--spacing-sm", { expr: "vars.spacingSm", importFrom: "./css-variables.stylex" }],
    ["--spacing-md", { expr: "vars.spacingMd", importFrom: "./css-variables.stylex" }],
    ["--spacing-lg", { expr: "vars.spacingLg", importFrom: "./css-variables.stylex" }],
    ["--border-radius", { expr: "vars.borderRadius", importFrom: "./css-variables.stylex" }],
  ],

  resolveValue(ctx) {
    // Only importedValue needs imperative handling; theme and cssVariable use declarative mappings.

    if (ctx.kind === "importedValue") {
      const source = ctx.source.value;
      if (!source.includes("lib/helpers") && !source.includes("lib\\helpers")) {
        throw new Error(`Unknown imported value: ${ctx.importedName}`);
      }
      if (ctx.importedName === "zIndex") {
        const path = ctx.path ?? "";
        return {
          expr: path ? `$zIndex.${path}` : "$zIndex",
          imports: importSpec(TOKENS, [{ imported: "$zIndex" }]),
        };
      }
      if (ctx.importedName === "config") {
        const path = ctx.path ?? "";
        return {
          expr: path ? `$config["${path}"]` : "$config",
          imports: importSpec(TOKENS, [{ imported: "$config" }]),
        };
      }
      if (ctx.importedName === "TruncateText") {
        return {
          usage: "props",
          expr: "helpers.truncate",
          imports: importSpec(HELPERS_STYLEX, [{ imported: "helpers" }]),
        };
      }
    }

    return undefined;
  },
  // Declarative call mapping — handles simple helper patterns declaratively.
  callMapping: [
    // CSS module className injection (needs explicit imports for `default` → `electronStyles` rename)
    [
      "draggableRegion",
      {
        extraClassNames: [
          {
            expr: "electronStyles.draggableRegionDisableChildren",
            imports: importSpec("./lib/electronMixins.module.css", [
              { imported: "default", local: "electronStyles" },
            ]),
          },
        ],
      },
    ],
    // StyleX mixin objects (usage: "props" + cssText for pseudo expansion)
    [
      "truncate",
      {
        usage: "props",
        expr: "helpers.truncate",
        cssText: "white-space: nowrap; overflow: hidden; text-overflow: ellipsis;",
        importFrom: HELPERS_STYLEX,
      },
    ],
    [
      "flexCenter",
      {
        usage: "props",
        expr: "helpers.flexCenter",
        cssText: "display: flex; align-items: center; justify-content: center;",
        importFrom: HELPERS_STYLEX,
      },
    ],
    [
      "gradient",
      {
        usage: "props",
        expr: "helpers.gradient",
        cssText: "background-image: linear-gradient(90deg, #ff6b6b, #5f6cff); color: transparent;",
        importFrom: HELPERS_STYLEX,
      },
    ],
    // Simple CSS value token accessors
    ["thinPixel", { expr: "pixelVars.thin", importFrom: TOKENS }],
    ["color", { expr: "$colors.{arg0}", importFrom: TOKENS }],
    ["fontWeight", { expr: "fontWeightVars.{arg0}", importFrom: TOKENS }],
    ["fontSize", { expr: "fontSizeVars.{arg0}", importFrom: TOKENS }],
    ["transitionSpeed", { expr: "transitionSpeed.{arg0}", importFrom: TOKENS }],
    // Dynamic arg with memberAccess: shadow("dark") → $shadow.dark, shadow(prop) → $shadow[prop]
    ["shadow", { expr: "$shadow.{arg0}", dynamicArgUsage: "memberAccess", importFrom: TOKENS }],
    // Runtime-only helpers (kept as wrapper inline styles)
    ["ColorConverter.cssWithAlpha", { preserveRuntimeCall: true }],
    ["getRowHighlightColor", { preserveRuntimeCall: true }],
  ],

  // Fallback for exotic call patterns that need arg inspection.
  resolveCall(ctx) {
    const src = ctx.calleeSource.value;
    if (!src.includes("lib/helpers") && !src.includes("lib\\helpers")) {
      throw new Error(`Unknown helper: ${src} ${ctx.calleeImportedName}`);
    }

    // Parameterized helpers: pass args through to StyleX style function
    if (ctx.calleeImportedName === "truncateMultiline") {
      return resolveParameterizedHelperCall(ctx, "helpers.truncateMultiline", "helpers");
    }
    if (ctx.calleeImportedName === "scrollFadeMaskStyles") {
      return resolveParameterizedHelperCall(ctx, "scrollFadeMaskStyles", "scrollFadeMaskStyles");
    }

    // Template literal helpers that embed theme args or literal args
    const arg0 = ctx.args[0];
    const key = arg0?.kind === "literal" && typeof arg0.value === "string" ? arg0.value : null;

    if (ctx.calleeImportedName === "thinBorder" && key) {
      return {
        expr: `\`\${pixelVars.thin} solid ${key}\``,
        imports: importSpec(TOKENS, [{ imported: "pixelVars" }]),
      };
    }

    const themeColorKey = extractThemeColorKey(arg0);
    if (ctx.calleeImportedName === "borderByColor" && themeColorKey) {
      return {
        expr: `\`1px solid \${$colors.${themeColorKey}}\``,
        imports: importSpec(TOKENS, [{ imported: "$colors" }]),
      };
    }
    if (ctx.calleeImportedName === "themedBorder" && key) {
      return {
        expr: `\`\${pixelVars.thin} solid \${$colors.${key}}\``,
        imports: importSpec(TOKENS, [{ imported: "pixelVars" }, { imported: "$colors" }]),
      };
    }

    return undefined;
  },
  resolveThemeCall(ctx) {
    // Preserve theme.highlightVariant() calls at runtime — the highlight variant
    // computes a color adjustment that can't be expressed statically.
    if (ctx.methodName === "highlightVariant") {
      return { preserveRuntimeCall: true };
    }
    return undefined;
  },
  // Declarative selector mapping — all selector patterns handled declaratively.
  selectorMapping: [
    [
      "screenSize.*",
      { kind: "media", expr: "breakpoints.{property}", importFrom: "./lib/breakpoints.stylex" },
    ],
    [
      "screenSizeBreakPoints.*",
      { kind: "media", expr: "breakpoints.{property}", importFrom: "./lib/breakpoints.stylex" },
    ],
    [
      "highlight",
      {
        kind: "pseudoAlias",
        values: ["active", "hover"],
        styleSelectorExpr: "highlightStyles",
        importFrom: "./lib/helpers",
      },
    ],
    [
      "highlightExpand",
      {
        kind: "pseudoExpand",
        expansions: [
          { pseudo: "active" },
          {
            pseudo: "hover",
            condition: { expr: "$interaction.canHover", importFrom: "./lib/interaction.stylex" },
          },
        ],
        imports: [],
      },
    ],
  ],

  // All selector patterns handled declaratively above.
  resolveSelector(_ctx) {
    return undefined;
  },
});

/** Extract theme color key from a call argument (e.g. theme.color.bgSub → "bgSub"). */
function extractThemeColorKey(arg: CallResolveContext["args"][0] | undefined): string | undefined {
  if (!arg || arg.kind !== "theme") {
    return undefined;
  }
  if (!arg.path.startsWith("color.")) {
    return undefined;
  }
  const k = arg.path.slice("color.".length);
  return k || undefined;
}

/**
 * Shared helper for parameterized helpers that return StyleX style objects.
 * Formats call args into a literal expression string and returns a "props" usage result.
 */
function resolveParameterizedHelperCall(
  ctx: CallResolveContext,
  exprTemplate: string,
  importName: string,
): CallResolveResult {
  const argsStr = ctx.args
    .map((a) =>
      a.kind === "literal"
        ? typeof a.value === "string"
          ? JSON.stringify(a.value)
          : String(a.value)
        : "undefined",
    )
    .join(", ");
  return {
    usage: "props",
    expr: `${exprTemplate}(${argsStr})`,
    imports: importSpec(HELPERS_STYLEX, [{ imported: importName }]),
  };
}

function customResolveValue(ctx: ResolveValueContext): ResolveValueResult | undefined {
  if (ctx.kind !== "theme") {
    return undefined;
  }
  return {
    expr: `customVar('${ctx.path}', '')`,
    imports: importSpec("./custom-theme", [{ imported: "customVar" }]),
  };
}

function customResolveSelector(_ctx: SelectorResolveContext): SelectorResolveResult | undefined {
  return undefined;
}

// Test adapters - examples of custom adapter usage
export const customAdapter = defineAdapter({
  styleMerger: null,
  useSxProp: false,
  externalInterface() {
    return { styles: false, as: false, ref: false };
  },
  resolveValue: customResolveValue,
  resolveCall(_ctx) {
    return undefined;
  },
  resolveSelector: customResolveSelector,
});

const INLINE_BASE_FLEX_IMPORTED_NAME = "Flex";
const INLINE_BASE_FLEX_CONSUMED_PROPS = [
  "align",
  "alignSelf",
  "as",
  "auto",
  "center",
  "column",
  "direction",
  "disabled",
  "gap",
  "grow",
  "inline",
  "justify",
  "noMinHeight",
  "noMinWidth",
  "overflowHidden",
  "reverse",
  "shrink",
  "wrap",
  "wrapGap",
];

function resolveInlineBaseFlexSx(
  staticProps: Record<string, string | number | boolean>,
): Record<string, string> {
  const sx: Record<string, string> = {};

  sx.display = staticProps.inline === true ? "inline-flex" : "flex";

  const isColumn = staticProps.column === true;
  const isReverse = staticProps.reverse === true;
  if (isColumn && isReverse) {
    sx.flexDirection = "column-reverse";
  } else if (isColumn) {
    sx.flexDirection = "column";
  } else if (isReverse) {
    sx.flexDirection = "row-reverse";
  } else if (typeof staticProps.direction === "string") {
    sx.flexDirection = staticProps.direction;
  } else {
    sx.flexDirection = "row";
  }

  if (typeof staticProps.align === "string") {
    sx.alignItems = staticProps.align;
  }

  if (typeof staticProps.justify === "string") {
    sx.justifyContent = staticProps.justify;
  }

  if (staticProps.center === true) {
    sx.alignItems = "center";
    sx.justifyContent = "center";
  }

  if (staticProps.auto === true) {
    sx.flex = "1 1 auto";
  }

  if (typeof staticProps.grow === "number") {
    sx.flexGrow = String(staticProps.grow);
  }

  if (typeof staticProps.shrink === "number") {
    sx.flexShrink = String(staticProps.shrink);
  }

  if (staticProps.wrap === true) {
    sx.flexWrap = "wrap";
  }

  if (typeof staticProps.alignSelf === "string") {
    sx.alignSelf = staticProps.alignSelf;
  }

  if (staticProps.overflowHidden === true) {
    sx.overflow = "hidden";
  }

  if (typeof staticProps.gap === "number") {
    sx.gap = `${staticProps.gap}px`;
  } else if (typeof staticProps.gap === "string") {
    sx.gap = staticProps.gap;
  }

  if (typeof staticProps.wrapGap === "number") {
    sx[isColumn ? "columnGap" : "rowGap"] = `${staticProps.wrapGap}px`;
  }

  if (staticProps.noMinWidth === true) {
    sx.minWidth = "0px";
  }

  if (staticProps.noMinHeight === true) {
    sx.minHeight = "0px";
  }

  return sx;
}

function stripInlineBaseFlexBaseStyles(
  sx: Record<string, string>,
  staticProps: Record<string, string | number | boolean>,
): Record<string, string> {
  const next = { ...sx };
  delete next.display;
  const dir = next.flexDirection;
  if (dir === "row" || (staticProps.direction === "row" && dir === staticProps.direction)) {
    delete next.flexDirection;
  }
  return next;
}

function isInlineBaseFlexSource(importSource: string): boolean {
  return (
    importSource.includes("lib/inline-base-flex") || importSource.includes("lib\\inline-base-flex")
  );
}

/**
 * Fixture adapters used by tests and e2e runs.
 * Core concepts: adapter hooks and test-specific resolution.
 */
import {
  type CallResolveContext,
  type CallResolveResult,
  defineAdapter,
  type ExternalInterfaceResult,
  type ResolveValueContext,
  type ResolveValueResult,
  type SelectorResolveContext,
  type SelectorResolveResult,
} from "../adapter.ts";

// Fixtures don't use theme resolution, but the transformer requires an adapter.
export const fixtureAdapter = defineAdapter({
  // Use mergedSx merger function for cleaner className/style merging output
  // See test-cases/lib/mergedSx.ts for the implementation
  styleMerger: {
    functionName: "mergedSx",
    importSource: { kind: "specifier", value: "./lib/mergedSx" },
  },

  // Configure external interface for exported components
  externalInterface(ctx): ExternalInterfaceResult {
    // Enable external styles + polymorphic `as` prop for test cases that need both
    if (
      ["externalStyles-basic", "externalStyles-input"].some((filePath) =>
        ctx.filePath.includes(filePath),
      )
    ) {
      return { styles: true, as: true, ref: true };
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
      ].some((filePath) => ctx.filePath.includes(filePath))
    ) {
      return { styles: true, as: false, ref: false };
    }

    // Enable styles + as to reproduce duplicate declaration bug
    if (ctx.filePath.includes("naming-duplicateDeclaration")) {
      return { styles: true, as: true, ref: true };
    }

    // wrapper-propsIncomplete - TextColor and ThemeText should extend HTMLAttributes
    // Highlight wraps a component and shouldn't support external styles
    if (ctx.filePath.includes("wrapper-propsIncomplete")) {
      if (ctx.componentName === "TextColor" || ctx.componentName === "ThemeText") {
        return { styles: true, as: false, ref: false };
      }
    }

    // Enable `as` prop support (without styles) for exported components in selected fixtures.
    if (
      ["asProp-exported", "asProp-crossFile"].some((filePath) => ctx.filePath.includes(filePath))
    ) {
      return { styles: false, as: true, ref: false };
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

  resolveValue(ctx) {
    if (ctx.kind === "theme") {
      // Test fixtures use a small ThemeProvider theme shape:
      //   props.theme.color.labelBase  -> $colors.labelBase
      //   props.theme.color[bg]        -> $colors[bg]
      //
      // `ctx.path` is the dot-path on the theme object (no bracket/index parts).
      if (ctx.path === "color") {
        return {
          expr: "$colors",
          imports: [
            {
              from: { kind: "specifier", value: "./tokens.stylex" },
              names: [{ imported: "$colors" }],
            },
          ],
        };
      }

      const lastSegment = ctx.path.split(".").pop();
      return {
        expr: `$colors.${lastSegment}`,
        imports: [
          {
            from: { kind: "specifier", value: "./tokens.stylex" },
            names: [{ imported: "$colors" }],
          },
        ],
      };
    }

    if (ctx.kind === "cssVariable") {
      const { name, definedValue } = ctx;

      // css-calc fixture: lift `var(--base-size)` to StyleX vars, and drop local definition when it matches.
      if (name === "--base-size") {
        return {
          expr: "calcVars.baseSize",
          imports: [
            {
              from: { kind: "specifier", value: "./css-calc.stylex" },
              names: [{ imported: "calcVars" }],
            },
          ],
          ...(definedValue === "16px" ? { dropDefinition: true } : {}),
        };
      }

      // css-variables fixture: map known vars to `vars.*` and `textVars.*`
      const varsMap: Record<string, string> = {
        "--color-primary": "colorPrimary",
        "--color-secondary": "colorSecondary",
        "--spacing-sm": "spacingSm",
        "--spacing-md": "spacingMd",
        "--spacing-lg": "spacingLg",
        "--border-radius": "borderRadius",
      };
      const fontWeightVarsMap: Record<string, string> = {
        "--font-weight-medium": "fontWeightVars.medium",
      };

      const v = varsMap[name];
      if (v) {
        return {
          expr: `vars.${v}`,
          imports: [
            {
              from: { kind: "specifier" as const, value: "./css-variables.stylex" },
              names: [{ imported: "vars" }],
            },
          ],
        };
      }
      const f = fontWeightVarsMap[name];
      if (f) {
        return {
          expr: `${f}`,
          imports: [
            {
              from: { kind: "specifier" as const, value: "./tokens.stylex" },
              names: [{ imported: "fontWeightVars" }],
            },
          ],
        };
      }
    }

    if (ctx.kind === "importedValue") {
      const source = ctx.source.value;
      if (!source.includes("lib/helpers") && !source.includes("lib\\helpers")) {
        throw new Error(`Unknown imported value: ${ctx.importedName}`);
      }
      if (ctx.importedName === "zIndex") {
        const path = ctx.path ?? "";
        return {
          expr: path ? `$zIndex.${path}` : "$zIndex",
          imports: [
            {
              from: { kind: "specifier", value: "./tokens.stylex" },
              names: [{ imported: "$zIndex" }],
            },
          ],
        };
      }
      if (ctx.importedName === "config") {
        const path = ctx.path ?? "";
        // For nested paths like "ui.spacing.small", use bracket notation with the full path
        return {
          expr: path ? `$config["${path}"]` : "$config",
          imports: [
            {
              from: { kind: "specifier", value: "./tokens.stylex" },
              names: [{ imported: "$config" }],
            },
          ],
        };
      }
      // Handle imported styled components used as mixins
      // TruncateText -> helpers.truncate (a StyleX style object)
      if (ctx.importedName === "TruncateText") {
        return {
          usage: "props",
          expr: "helpers.truncate",
          imports: [
            {
              from: { kind: "specifier", value: "./lib/helpers.stylex" },
              names: [{ imported: "helpers" }],
            },
          ],
        };
      }
    }

    // Return undefined to bail/skip the file
    return undefined;
  },
  resolveCall(ctx) {
    const src = ctx.calleeSource.value;
    // Note: calleeSource.value may or may not include the extension
    if (!src.includes("lib/helpers") && !src.includes("lib\\helpers")) {
      throw new Error(`Unknown helper: ${src} ${ctx.calleeImportedName}`);
    }

    if (ctx.calleeImportedName === "truncateMultiline") {
      return resolveParameterizedHelperCall(ctx, "helpers.truncateMultiline", "helpers");
    }

    if (ctx.calleeImportedName === "scrollFadeMaskStyles") {
      return resolveParameterizedHelperCall(ctx, "scrollFadeMaskStyles", "scrollFadeMaskStyles");
    }

    // Map helper names to their CSS text for pseudo-selector expansion
    const helperCssText: Record<string, string> = {
      truncate: "white-space: nowrap; overflow: hidden; text-overflow: ellipsis;",
      flexCenter: "display: flex; align-items: center; justify-content: center;",
      gradient: "background-image: linear-gradient(90deg, #ff6b6b, #5f6cff); color: transparent;",
    };
    const helperStyleKey = (() => {
      switch (ctx.calleeImportedName) {
        case "gradient":
        case "truncate":
        case "flexCenter":
          return ctx.calleeImportedName;
        default:
          return undefined;
      }
    })();
    if (helperStyleKey) {
      // These helpers return StyleX style objects (for standalone interpolations)
      // Explicitly mark as "props" so the codemod knows not to use them as CSS values
      // Include cssText so the codemod can expand properties for pseudo-selector wrapping
      return {
        usage: "props",
        expr: `helpers.${helperStyleKey}`,
        imports: [
          {
            from: { kind: "specifier", value: "./lib/helpers.stylex" },
            names: [{ imported: "helpers" }],
          },
        ],
        cssText: helperCssText[helperStyleKey],
      };
    }

    if (ctx.calleeImportedName === "thinPixel") {
      return {
        expr: "pixelVars.thin",
        imports: [
          {
            from: { kind: "specifier", value: "./tokens.stylex" },
            names: [{ imported: "pixelVars" }],
          },
        ],
      };
    }

    const arg0 = ctx.args[0];
    const key = arg0?.kind === "literal" && typeof arg0.value === "string" ? arg0.value : null;
    const themeColorKey = (() => {
      if (!arg0 || arg0.kind !== "theme") {
        return undefined;
      }
      // Only support theme color paths like: props.theme.color.bgSub -> "color.bgSub"
      if (!arg0.path.startsWith("color.")) {
        return undefined;
      }
      const k = arg0.path.slice("color.".length);
      return k ? k : null;
    })();

    // Handle borderByColor(theme.color.*) helper from ./lib/helpers.ts
    // borderByColor(props.theme.color.bgSub) -> `1px solid ${$colors.bgSub}`
    if (ctx.calleeImportedName === "borderByColor" && themeColorKey) {
      return {
        expr: `\`1px solid \${$colors.${themeColorKey}}\``,
        imports: [
          {
            from: { kind: "specifier", value: "./tokens.stylex" },
            names: [{ imported: "$colors" }],
          },
        ],
      };
    }

    // Handle ColorConverter.cssWithAlpha(theme.color.*, alpha) helper
    // Keep this as a runtime helper call in the generated wrapper (no static fallback).
    if (
      ctx.calleeImportedName === "ColorConverter" &&
      ctx.calleeMemberPath?.[0] === "cssWithAlpha" &&
      themeColorKey
    ) {
      return {
        preserveRuntimeCall: true,
      };
    }

    // Handle shadow() helper — demonstrates dynamic prop arg resolution.
    // shadow("dark") → $shadow.dark (literal arg)
    // shadow(props.level) → $shadow[level] (dynamic arg — adapter remaps callee with member access)
    if (ctx.calleeImportedName === "shadow") {
      if (key) {
        return {
          expr: `$shadow.${key}`,
          imports: [
            {
              from: { kind: "specifier", value: "./tokens.stylex" },
              names: [{ imported: "$shadow" }],
            },
          ],
        };
      }
      // Dynamic arg — return the vars object with memberAccess usage
      return {
        expr: "$shadow",
        dynamicArgUsage: "memberAccess",
        imports: [
          {
            from: { kind: "specifier", value: "./tokens.stylex" },
            names: [{ imported: "$shadow" }],
          },
        ],
      };
    }

    if (!key) {
      return undefined;
    }

    // Handle color() helper from ./lib/helpers.ts
    // color("bgBase") -> $colors.bgBase
    if (ctx.calleeImportedName === "color") {
      return {
        expr: `$colors.${key}`,
        imports: [
          {
            from: { kind: "specifier", value: "./tokens.stylex" },
            names: [{ imported: "$colors" }],
          },
        ],
      };
    }

    // Handle fontWeight() helper from ./lib/helpers.ts
    // fontWeight("medium") -> fontWeightVars.medium
    if (ctx.calleeImportedName === "fontWeight") {
      return {
        expr: `fontWeightVars.${key}`,
        imports: [
          {
            from: { kind: "specifier", value: "./tokens.stylex" },
            names: [{ imported: "fontWeightVars" }],
          },
        ],
      };
    }

    // Handle fontSize() helper from ./lib/helpers.ts
    // fontSize("medium") -> fontSizeVars.medium
    if (ctx.calleeImportedName === "fontSize") {
      return {
        expr: `fontSizeVars.${key}`,
        imports: [
          {
            from: { kind: "specifier", value: "./tokens.stylex" },
            names: [{ imported: "fontSizeVars" }],
          },
        ],
      };
    }

    // Handle transitionSpeed() helper from ./lib/helpers.ts
    if (ctx.calleeImportedName === "transitionSpeed") {
      return {
        expr: `transitionSpeed.${key}`,
        imports: [
          {
            from: { kind: "specifier", value: "./tokens.stylex" },
            names: [{ imported: "transitionSpeed" }],
          },
        ],
      };
    }

    // Handle themedBorder() helper from ./lib/helpers.ts
    // Returns undefined (bails) if key is missing, e.g. themedBorder() without argument
    // Returns a CSS value expression that gets expanded to borderWidth/Style/Color properties
    if (ctx.calleeImportedName === "themedBorder" && key) {
      return {
        expr: `\`\${pixelVars.thin} solid \${$colors.${key}}\``,
        imports: [
          {
            from: { kind: "specifier", value: "./tokens.stylex" },
            names: [{ imported: "pixelVars" }, { imported: "$colors" }],
          },
        ],
      };
    }

    return undefined;
  },
  resolveSelector(ctx) {
    const source = ctx.source.value;
    if (!source.includes("lib/helpers") && !source.includes("lib\\helpers")) {
      return undefined;
    }

    // Handle screenSize.phone, screenSize.tablet, etc.
    if (ctx.importedName === "screenSize" && ctx.path) {
      return {
        kind: "media",
        expr: `breakpoints.${ctx.path}`,
        imports: [
          {
            from: { kind: "specifier", value: "./lib/breakpoints.stylex" },
            names: [{ imported: "breakpoints" }],
          },
        ],
      };
    }

    // Handle `highlight` pseudo-class interpolation: &:${highlight}
    // Resolves to a pseudoAlias that expands into :active and :hover pseudo style objects,
    // wrapped in a highlightStyles() function call for runtime selection.
    if (ctx.importedName === "highlight") {
      return {
        kind: "pseudoAlias",
        values: ["active", "hover"],
        styleSelectorExpr: "highlightStyles",
        imports: [
          {
            from: { kind: "specifier", value: "./lib/helpers" },
            names: [{ imported: "highlightStyles" }],
          },
        ],
      };
    }

    return undefined;
  },
});

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
    imports: [
      {
        from: { kind: "specifier", value: "./lib/helpers.stylex" },
        names: [{ imported: importName }],
      },
    ],
  };
}

function customResolveValue(ctx: ResolveValueContext): ResolveValueResult | undefined {
  if (ctx.kind !== "theme") {
    return undefined;
  }
  return {
    expr: `customVar('${ctx.path}', '')`,
    imports: [
      {
        from: { kind: "specifier", value: "./custom-theme" },
        names: [{ imported: "customVar" }],
      },
    ],
  };
}

function customResolveSelector(_ctx: SelectorResolveContext): SelectorResolveResult | undefined {
  return undefined;
}

// Test adapters - examples of custom adapter usage
export const customAdapter = defineAdapter({
  styleMerger: null,
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
  "as",
  "center",
  "column",
  "direction",
  "gap",
  "noMinWidth",
];
const INLINE_BASE_ALIGN_MAP: Record<string, string> = {
  start: "flex-start",
  center: "center",
  end: "flex-end",
  stretch: "stretch",
};

function resolveInlineBaseFlexSx(
  staticProps: Record<string, string | number | boolean>,
): Record<string, string> {
  const sx: Record<string, string> = {
    display: "flex",
  };

  if (staticProps.center === true) {
    sx.alignItems = "center";
    sx.justifyContent = "center";
  }

  if (staticProps.column === true) {
    sx.flexDirection = "column";
  } else if (typeof staticProps.direction === "string") {
    sx.flexDirection = staticProps.direction;
  }

  if (typeof staticProps.gap === "number") {
    sx.gap = `${staticProps.gap}px`;
  } else if (typeof staticProps.gap === "string") {
    sx.gap = staticProps.gap;
  }

  if (typeof staticProps.align === "string") {
    sx.alignItems = INLINE_BASE_ALIGN_MAP[staticProps.align] ?? staticProps.align;
  }

  if (staticProps.noMinWidth === true) {
    sx.minWidth = "0px";
  }

  return sx;
}

function stripInlineBaseFlexBaseStyles(
  sx: Record<string, string>,
  staticProps: Record<string, string | number | boolean>,
): Record<string, string> {
  const next = { ...sx };
  delete next.display;
  if (staticProps.direction === "row" && next.flexDirection === "row") {
    delete next.flexDirection;
  }
  return next;
}

function isInlineBaseFlexSource(importSource: string): boolean {
  return (
    importSource.includes("lib/inline-base-flex") || importSource.includes("lib\\inline-base-flex")
  );
}

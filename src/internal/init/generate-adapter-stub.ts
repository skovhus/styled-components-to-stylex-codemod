/**
 * Adapter stub generator for the `runInit` command.
 *
 * Takes scanned patterns and produces a TypeScript adapter file
 * with inline docs and TODO placeholders.
 */
import type { ScannedPatterns } from "./scan-patterns.js";

/* ── Public API ───────────────────────────────────────────────────────── */

export function generateAdapterStub(patterns: ScannedPatterns): string {
  const sections = [
    header(patterns),
    'import { defineAdapter, runTransform } from "styled-components-to-stylex-codemod";\n',
    "export const adapter = defineAdapter({",
    STYLE_MERGER,
    patterns.themeRoots.size > 0 ? themeMappingSection(patterns) : "",
    resolveValueSection(patterns),
    resolveCallSection(patterns),
    resolveSelectorSection(patterns),
    patterns.styledWrappers.size > 0 ? resolveBaseComponentSection(patterns) : "",
    EXTERNAL_INTERFACE,
    USE_SX_PROP,
    patterns.hasUseTheme ? THEME_HOOK : "",
    "});\n",
  ];
  return sections.filter(Boolean).join("\n");
}

export function generateSummary(patterns: ScannedPatterns): string {
  const parts: string[] = [];

  parts.push(
    `Scanned ${patterns.filesScanned} files, found styled-components in ${patterns.filesWithStyledComponents} files.\n`,
  );

  if (patterns.themeRoots.size > 0) {
    parts.push(`Theme roots: ${sorted(patterns.themeRoots).join(", ")}`);
    parts.push(`  Unique theme paths (${patterns.themePaths.size}):`);
    for (const p of sorted(patterns.themePaths).slice(0, 20)) {
      parts.push(`    - theme.${p}`);
    }
    if (patterns.themePaths.size > 20) {
      parts.push(`    ... and ${patterns.themePaths.size - 20} more`);
    }
    if (patterns.hasIndexedThemeLookup) {
      parts.push("  Indexed lookups detected (e.g. theme.color[prop])");
    }
    parts.push("");
  }

  if (patterns.cssVariables.size > 0) {
    parts.push(`CSS variables (${patterns.cssVariables.size}):`);
    for (const v of sorted(patterns.cssVariables).slice(0, 15)) {
      parts.push(`  - ${v}`);
    }
    if (patterns.cssVariables.size > 15) {
      parts.push(`  ... and ${patterns.cssVariables.size - 15} more`);
    }
    parts.push("");
  }

  for (const [label, map, fmt] of [
    [
      "Helper functions called in interpolations",
      patterns.helperCalls,
      (n: string, e: ImportEntry) => `  - ${n} (from "${e.source}")`,
    ],
    [
      "Selector interpolations",
      patterns.selectorInterpolations,
      (n: string, e: ImportEntry) => `  - \${${n}} (from "${e.source}")`,
    ],
    [
      "styled() wrappers around imported components",
      patterns.styledWrappers,
      (n: string, e: ImportEntry) => `  - styled(${n}) (from "${e.source}")`,
    ],
  ] as const) {
    if (map.size > 0) {
      parts.push(`${label} (${map.size}):`);
      for (const [name, entry] of sortedEntries(map)) {
        parts.push((fmt as (n: string, e: ImportEntry) => string)(name, entry));
      }
      parts.push("");
    }
  }

  if (patterns.hasUseTheme) {
    parts.push("useTheme() hook usage detected\n");
  }

  parts.push("Adapter hooks needed:");
  parts.push(`  - resolveValue: ${describeResolveValueNeeds(patterns)}`);
  parts.push(
    `  - resolveCall: ${patterns.helperCalls.size > 0 ? `${patterns.helperCalls.size} helper(s)` : "none detected"}`,
  );
  parts.push(
    `  - resolveSelector: ${patterns.selectorInterpolations.size > 0 ? `${patterns.selectorInterpolations.size} selector(s)` : "none detected"}`,
  );
  parts.push("  - externalInterface: needs configuration");
  if (patterns.themeRoots.size > 0) {
    parts.push(`  - themeMapping: ${patterns.themeRoots.size} theme root(s)`);
  }
  if (patterns.hasUseTheme) {
    parts.push("  - themeHook: useTheme detected");
  }

  return parts.join("\n");
}

/* ── Types ────────────────────────────────────────────────────────────── */

type ImportEntry = { source: string; importedName: string };

/* ── Static sections (no dynamic content) ─────────────────────────────── */

const STYLE_MERGER = `\
  /**
   * Custom merger for className/style combining.
   * Provide a helper function for cleaner output, or null for verbose inline merging.
   * Signature: merger(styles, className?, style?): { className?: string; style?: CSSProperties }
   */
  // TODO: Configure a styleMerger or set to null
  styleMerger: null,
`;

const EXTERNAL_INTERFACE = `\
  /**
   * Control which exported components accept external className/style/as props.
   * "auto" scans consumer files (requires consumerPaths). For manual control:
   *   externalInterface(ctx) { return { styles: true, as: false, ref: false }; }
   */
  externalInterface: "auto",
`;

const USE_SX_PROP = `\
  /**
   * Emit sx={...} instead of {...stylex.props(...)} spreads.
   * Requires @stylexjs/babel-plugin >=0.18 with sxPropName enabled.
   */
  useSxProp: false,
`;

const THEME_HOOK = `\
  /**
   * Theme hook for wrappers needing runtime theme access.
   * Update if your project uses a custom hook instead of useTheme from styled-components.
   */
  // TODO: Update if your theme hook has a different name or import source.
  themeHook: {
    functionName: "useTheme",
    importSource: { kind: "specifier", value: "styled-components" },
  },
`;

/* ── Dynamic sections ─────────────────────────────────────────────────── */

function header(patterns: ScannedPatterns): string {
  return `\
/**
 * Adapter for styled-components-to-stylex codemod.
 * Generated by runInit — scanned ${patterns.filesWithStyledComponents} files with styled-components.
 *
 * Search for TODO comments to fill in project-specific mappings.
 *
 * Migration steps:
 *   1. Define your theme tokens as StyleX variables (stylex.defineVars)
 *   2. Fill in the TODO sections below to map your theme/helpers/selectors
 *   3. Run: await runTransform({ files: "src/**/*.tsx", consumerPaths: "src/**/*.tsx", adapter })
 *   4. Verify output, fix warnings, iterate
 *
 * Docs: https://github.com/skovhus/styled-components-to-stylex-codemod#adapter
 */`;
}

function themeMappingSection(patterns: ScannedPatterns): string {
  const entries: string[] = [];
  for (const root of sorted(patterns.themeRoots)) {
    const rootPaths = [...patterns.themePaths].filter(
      (p) => p.startsWith(root + ".") || p === root,
    );
    entries.push(`    // theme.${root} — ${rootPaths.length} path(s) detected`);
    if (patterns.hasIndexedThemeLookup) {
      entries.push(
        `    // TODO: Uncomment if theme.${root}[dynamicProp] should use a prebuilt mixin map:\n` +
          `    // ["${root}", { indexed: true, usage: "props", dynamicArgUsage: "memberAccess",\n` +
          `    //   expr: "$${root}Mixins.{cssProperty}",\n` +
          `    //   imports: [{ from: { kind: "specifier", value: "./${root}Mixins.stylex" }, names: [{ imported: "$${root}Mixins" }] }] }],`,
      );
    }
    const isExact = rootPaths.length === 1 && rootPaths[0] === root;
    const pattern = isExact ? root : `${root}.*`;
    const expr = isExact ? `$tokens.${root}` : `$${root}.{property}`;
    const imported = isExact ? "$tokens" : `$${root}`;
    entries.push(
      `    // TODO: Map theme.${isExact ? root : `${root}.*`} to StyleX tokens\n` +
        `    ["${pattern}", { expr: "${expr}", imports: [{ from: { kind: "specifier", value: "./tokens.stylex" }, names: [{ imported: "${imported}" }] }] }],\n`,
    );
  }
  return `\
  /**
   * Declarative theme path → StyleX token mapping. First match wins.
   * Patterns: exact ("color"), prefix ("color.*"), wildcard ("*")
   * Entries: { expr, imports } | { bail: true } | { directional: [...] }
   * Placeholders: {property} (remaining path), {cssProperty} (camelCase CSS prop)
   */
  themeMapping: [
${entries.join("\n")}  ],
`;
}

function resolveValueSection(patterns: ScannedPatterns): string {
  let body = "";
  if (patterns.themeRoots.size > 0) {
    body += "    // Theme lookups handled by themeMapping above.\n";
  }
  if (patterns.cssVariables.size > 0) {
    const sample = sorted(patterns.cssVariables).slice(0, 5).join(", ");
    const ellipsis = patterns.cssVariables.size > 5 ? ", ..." : "";
    body +=
      `\n    if (ctx.kind === "cssVariable") {\n` +
      `      // TODO: Map CSS variables to StyleX tokens. Found: ${sample}${ellipsis}\n` +
      `      // Example: return { expr: \`$vars.\${camel}\`, imports: [...] };\n` +
      `      return undefined;\n    }\n`;
  }
  if (patterns.styledWrappers.size > 0) {
    body +=
      `\n    if (ctx.kind === "importedValue") {\n` +
      `      // TODO: Map imported styled-component values to StyleX equivalents.\n` +
      `      return undefined;\n    }\n`;
  }
  return `\
  /**
   * Resolve dynamic values: theme access, CSS variables, imported values.
   * Return { expr, imports } or undefined to bail.
   */
  resolveValue(ctx) {
${body}
    return undefined;
  },
`;
}

function resolveCallSection(patterns: ScannedPatterns): string {
  let body: string;
  if (patterns.helperCalls.size > 0) {
    const list = sortedEntries(patterns.helperCalls)
      .map(([n, e]) => `    //   ${n} (from "${e.source}")`)
      .join("\n");
    body = `    // Detected helpers:\n${list}\n    // TODO: Map each helper. Return { expr, imports } or { preserveRuntimeCall: true }.`;
  } else {
    body = "    // No helper calls detected.";
  }
  return `\
  /**
   * Resolve helper function calls in interpolations.
   * With ctx.cssProperty → CSS value; without → StyleX style object.
   */
  resolveCall(ctx) {
${body}
    return undefined;
  },
`;
}

function resolveSelectorSection(patterns: ScannedPatterns): string {
  let body: string;
  if (patterns.selectorInterpolations.size > 0) {
    const list = sortedEntries(patterns.selectorInterpolations)
      .map(([n, e]) => `    //   \${${n}} (from "${e.source}")`)
      .join("\n");
    body = `    // Detected selectors:\n${list}\n    // TODO: Return { kind: "media", expr, imports } or { kind: "pseudoAlias", values, imports }.`;
  } else {
    body = "    // No selector interpolations detected.";
  }
  return `\
  /**
   * Resolve interpolations in CSS selector position.
   */
  resolveSelector(ctx) {
${body}
    return undefined;
  },
`;
}

function resolveBaseComponentSection(patterns: ScannedPatterns): string {
  const list = sortedEntries(patterns.styledWrappers)
    .map(([n, e]) => `    //   styled(${n}) (from "${e.source}")`)
    .join("\n");
  return `\
  /**
   * Inline styled(ImportedComponent) into an intrinsic element when behavior is purely CSS.
   * Return { tagName, consumedProps, sx } to inline, or undefined to keep normal behavior.
   */
  resolveBaseComponent(ctx) {
    // Detected wrappers:
${list}
    // TODO: Inline base components. Example: return { tagName: "div", consumedProps: [...], sx: {...} };
    return undefined;
  },
`;
}

/* ── Helpers ──────────────────────────────────────────────────────────── */

function sorted(set: Set<string>): string[] {
  return [...set].sort();
}

function sortedEntries(map: Map<string, ImportEntry>): [string, ImportEntry][] {
  return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
}

function describeResolveValueNeeds(patterns: ScannedPatterns): string {
  const parts: string[] = [];
  if (patterns.themeRoots.size > 0) {
    parts.push(`${patterns.themeRoots.size} theme root(s)`);
  }
  if (patterns.cssVariables.size > 0) {
    parts.push(`${patterns.cssVariables.size} CSS variable(s)`);
  }
  if (patterns.styledWrappers.size > 0) {
    parts.push(`${patterns.styledWrappers.size} imported value(s)`);
  }
  return parts.length > 0 ? parts.join(", ") : "none detected";
}

import type {
  API,
  FileInfo,
  Options,
  TaggedTemplateExpression,
  TemplateLiteral,
} from "jscodeshift";
import type { Adapter } from "./adapter.js";
import { defaultAdapter } from "./adapter.js";
import { compile } from "stylis";

/**
 * Warning emitted during transformation for unsupported features
 */
export interface TransformWarning {
  type: "unsupported-feature";
  feature: string;
  message: string;
  line?: number;
  column?: number;
}

/**
 * Result of the transform including any warnings
 */
export interface TransformResult {
  code: string | null;
  warnings: TransformWarning[];
}

/**
 * Options for the transform
 */
export interface TransformOptions extends Options {
  /** Adapter for transforming theme values (defaults to cssVariablesAdapter) */
  adapter?: Adapter;
  /** Optional plugins to handle dynamic CSS contexts (primarily for experimentation/testing) */
  dynamicPlugins?: DynamicPlugin[];
}

const PLACEHOLDER_PATTERN = /var\(--__dyn_(\d+)__\)/g;

function createPlaceholder(index: number): string {
  return `${PLACEHOLDER_PREFIX}${index}__)`;
}

function extractChunks(template: TemplateLiteral): {
  chunks: CSSChunk[];
  tokens: DynamicToken[];
} {
  const chunks: CSSChunk[] = [];
  const tokens: DynamicToken[] = [];

  template.quasis.forEach((quasi, index) => {
    const raw = quasi.value.raw;
    if (raw) {
      chunks.push({ kind: "static", value: raw });
    }

    const expr = template.expressions[index];
    if (expr) {
      const token: DynamicToken = {
        id: index,
        placeholder: createPlaceholder(index),
        expression: expr,
      };
      chunks.push({ kind: "dynamic", token });
      tokens.push(token);
    }
  });

  return { chunks, tokens };
}

function renderChunks(chunks: CSSChunk[]): string {
  return chunks
    .map((chunk) => (chunk.kind === "static" ? chunk.value : chunk.token.placeholder))
    .join("");
}

function parseDeclarationValue(raw: string, tokens: DynamicToken[]): ParsedDeclarationValue {
  const segments: ParsedDeclarationValue["segments"] = [];
  let remaining = raw;
  for (const token of tokens) {
    const idx = remaining.indexOf(token.placeholder);
    if (idx === -1) {
      continue;
    }

    if (idx > 0) {
      segments.push({ kind: "text", value: remaining.slice(0, idx) });
    }
    segments.push({ kind: "dynamic", token });
    remaining = remaining.slice(idx + token.placeholder.length);
  }

  if (remaining) {
    segments.push({ kind: "text", value: remaining });
  }

  return { raw, segments };
}

function parseTemplateLiteral(template: TemplateLiteral): ParsedTemplateLiteral {
  const { chunks, tokens } = extractChunks(template);
  const cssText = renderChunks(chunks);

  // Ensure every token placeholder survived reconstruction so parsing errors can be surfaced early.
  for (const token of tokens) {
    if (!cssText.includes(token.placeholder)) {
      throw new Error(`Placeholder ${token.placeholder} missing from rendered CSS text`);
    }
  }
  const ast = compile(cssText);
  const rules: ParsedRule[] = [];

  function walk(
    nodes: ReturnType<typeof compile>,
    atRulePath: string[],
    selectorPath: string[],
  ): void {
    for (const node of nodes) {
      if (node.type === "rule") {
        const declarations: ParsedDeclaration[] = [];
        const children = Array.isArray(node.children) ? node.children : [];
        for (const decl of children) {
          if (decl.type !== "decl") continue;
          const prop = typeof decl.props === "string" ? decl.props : decl.props?.[0];
          const value = typeof decl.children === "string" ? decl.children : (decl.value ?? "");
          if (prop) {
            declarations.push({
              property: prop,
              value: parseDeclarationValue(value, tokens),
            });
          }
        }

        rules.push({
          selectors: Array.isArray(node.props) ? node.props : selectorPath,
          atRulePath,
          declarations,
        });
      } else if (node.type === "decl") {
        const prop = typeof node.props === "string" ? node.props : node.props?.[0];
        const value = typeof node.children === "string" ? node.children : (node.value ?? "");

        if (prop) {
          rules.push({
            selectors: selectorPath.length > 0 ? selectorPath : ["&"],
            atRulePath,
            declarations: [
              {
                property: prop,
                value: parseDeclarationValue(value, tokens),
              },
            ],
          });
        }
      } else if (
        typeof node.type === "string" &&
        node.type.startsWith("@") &&
        Array.isArray(node.children)
      ) {
        const nextAtRulePath = [...atRulePath, node.value ?? node.type];
        walk(node.children, nextAtRulePath, selectorPath);
      }
    }
  }

  walk(ast, [], []);

  return { chunks, cssText, rules };
}

function findDynamicContexts(parsed: ParsedTemplateLiteral): DynamicContext[] {
  const contexts: DynamicContext[] = [];
  const tokenByPlaceholder = new Map(
    parsed.chunks
      .filter((chunk): chunk is DynamicChunk => chunk.kind === "dynamic")
      .map((chunk) => [chunk.token.placeholder, chunk.token]),
  );

  for (const rule of parsed.rules) {
    const selectorString = rule.selectors.join(", ");
    for (const match of selectorString.matchAll(PLACEHOLDER_PATTERN)) {
      const id = Number(match[1]);
      const placeholder = createPlaceholder(id);
      const token = tokenByPlaceholder.get(placeholder);
      if (!token) continue;
      contexts.push({
        kind: "selector",
        token,
        selectorPath: rule.selectors,
        atRulePath: rule.atRulePath,
      });
    }

    for (const decl of rule.declarations) {
      for (const segment of decl.value.segments) {
        if (segment.kind === "dynamic") {
          contexts.push({
            kind: "declaration-value",
            token: segment.token,
            selectorPath: rule.selectors,
            atRulePath: rule.atRulePath,
            property: decl.property,
          });
        }
      }
    }

    const lastAtRule = rule.atRulePath.at(-1);
    if (lastAtRule) {
      for (const match of lastAtRule.matchAll(PLACEHOLDER_PATTERN)) {
        const id = Number(match[1]);
        const placeholder = createPlaceholder(id);
        const token = tokenByPlaceholder.get(placeholder);
        if (!token) continue;
        contexts.push({
          kind: "at-rule-params",
          token,
          selectorPath: rule.selectors,
          atRulePath: rule.atRulePath,
        });
      }
    }
  }

  return contexts;
}

function runDynamicPlugins(contexts: DynamicContext[], plugins: DynamicPlugin[]): PluginResult[] {
  const results: PluginResult[] = [];

  for (const context of contexts) {
    for (const plugin of plugins) {
      const result = plugin(context);
      if (!result) continue;
      results.push(result);
      if (result.action === "bail") break;
    }
  }

  return results;
}

function collectDynamicWarnings(results: PluginResult[]): TransformWarning[] {
  return results
    .filter((result): result is PluginResult & { action: "bail" } => result.action === "bail")
    .map((result) => ({
      type: "unsupported-feature",
      feature: "dynamic-css",
      message: result.reason ?? "Dynamic CSS interpolation not supported",
    }));
}

const defaultDynamicPlugins: DynamicPlugin[] = [() => ({ action: "keep" })];

function collectUnclassifiedDynamicWarnings(
  parsed: ParsedTemplateLiteral,
  contexts: DynamicContext[],
): TransformWarning[] {
  const warnings: TransformWarning[] = [];
  if (contexts.length === 0 && parsed.rules.length === 0) {
    const usedPlaceholders = new Set(contexts.map((ctx) => ctx.token.placeholder));

    for (const chunk of parsed.chunks) {
      if (chunk.kind !== "dynamic") continue;
      if (usedPlaceholders.has(chunk.token.placeholder)) continue;

      warnings.push({
        type: "unsupported-feature",
        feature: "dynamic-css",
        message:
          "Dynamic interpolation could not be classified (e.g., comment or unsupported position) and requires manual handling.",
      });
    }
  }

  return warnings;
}

function getStyledIdentifiers(
  j: API["jscodeshift"],
  root: ReturnType<API["jscodeshift"]>,
): {
  styled: Set<string>;
} {
  const styled = new Set<string>();

  root.find(j.ImportDeclaration, { source: { value: "styled-components" } }).forEach((path) => {
    const specs = path.node.specifiers ?? [];
    for (const spec of specs) {
      if (spec.type === "ImportDefaultSpecifier" && spec.local?.type === "Identifier") {
        styled.add(spec.local.name);
      }
    }
  });

  return { styled };
}

function isStyledTemplate(node: TaggedTemplateExpression, styledIdentifiers: Set<string>): boolean {
  const { tag } = node;
  if (tag.type === "MemberExpression" && tag.object.type === "Identifier") {
    return styledIdentifiers.has(tag.object.name);
  }
  if (tag.type === "CallExpression" && tag.callee.type === "Identifier") {
    return styledIdentifiers.has(tag.callee.name);
  }
  return false;
}

export type DynamicToken = {
  id: number;
  placeholder: string;
  expression: unknown;
};

type StaticChunk = {
  kind: "static";
  value: string;
};

type DynamicChunk = {
  kind: "dynamic";
  token: DynamicToken;
};

type CSSChunk = StaticChunk | DynamicChunk;

export interface ParsedDeclarationValue {
  raw: string;
  segments: ({ kind: "text"; value: string } | { kind: "dynamic"; token: DynamicToken })[];
}

export interface ParsedDeclaration {
  property: string;
  value: ParsedDeclarationValue;
}

export interface ParsedRule {
  selectors: string[];
  atRulePath: string[];
  declarations: ParsedDeclaration[];
}

export interface ParsedTemplateLiteral {
  chunks: CSSChunk[];
  cssText: string;
  rules: ParsedRule[];
}

export type DynamicContextKind = "declaration-value" | "selector" | "at-rule-params" | "unknown";

export interface DynamicContext {
  kind: DynamicContextKind;
  token: DynamicToken;
  selectorPath: string[];
  atRulePath: string[];
  property?: string;
}

export interface PluginResult {
  action: "keep" | "replace" | "bail";
  reason?: string;
  replacement?: string;
}

export type DynamicPlugin = (context: DynamicContext) => PluginResult | void;

const PLACEHOLDER_PREFIX = "var(--__dyn_";

/**
 * Transform styled-components to StyleX
 *
 * This is a sample transform that serves as a starting point.
 * You'll need to implement the actual transformation logic based on your needs.
 */
export default function transform(
  file: FileInfo,
  api: API,
  options: TransformOptions,
): string | null {
  const result = transformWithWarnings(file, api, options);

  // Log warnings to console
  for (const warning of result.warnings) {
    const location = warning.line
      ? ` (${file.path}:${warning.line}:${warning.column ?? 0})`
      : ` (${file.path})`;
    console.warn(`[styled-components-to-stylex] Warning${location}: ${warning.message}`);
  }

  return result.code;
}

/**
 * Transform with detailed warnings returned (for testing)
 */
export function transformWithWarnings(
  file: FileInfo,
  api: API,
  options: TransformOptions,
): TransformResult {
  const j = api.jscodeshift;
  const root = j(file.source);
  const warnings: TransformWarning[] = [];
  // Use provided adapter or default
  const adapter: Adapter = options.adapter ?? defaultAdapter;
  const dynamicPlugins = options.dynamicPlugins ?? defaultDynamicPlugins;
  void adapter; // Currently unused while transform is a stub

  // Find styled-components imports
  const styledImports = root.find(j.ImportDeclaration, {
    source: { value: "styled-components" },
  });

  if (styledImports.length === 0) {
    return { code: null, warnings: [] };
  }

  // Check for createGlobalStyle usage
  styledImports.forEach((importPath) => {
    const specifiers = importPath.node.specifiers ?? [];
    for (const specifier of specifiers) {
      if (
        specifier.type === "ImportSpecifier" &&
        specifier.imported.type === "Identifier" &&
        specifier.imported.name === "createGlobalStyle"
      ) {
        const warning: TransformWarning = {
          type: "unsupported-feature",
          feature: "createGlobalStyle",
          message:
            "createGlobalStyle is not supported in StyleX. Global styles should be handled separately (e.g., in a CSS file or using CSS reset libraries).",
        };
        if (specifier.loc) {
          warning.line = specifier.loc.start.line;
          warning.column = specifier.loc.start.column;
        }
        warnings.push(warning);
      }
    }
  });

  // Detect patterns that aren't directly representable in StyleX (or require semantic rewrites).
  // These warnings are used for per-fixture expectations and help guide manual follow-ups.
  let hasComponentSelector = false;
  let hasSpecificityHack = false;

  root.find(j.TemplateLiteral).forEach((p) => {
    const tl = p.node;

    // Specificity hacks like `&&` / `&&&` inside styled template literals.
    for (const quasi of tl.quasis) {
      if (quasi.value.raw.includes("&&")) {
        hasSpecificityHack = true;
      }
    }

    // Component selector patterns like `${Link}:hover & { ... }`
    for (let i = 0; i < tl.expressions.length; i++) {
      const expr = tl.expressions[i];
      const after = tl.quasis[i + 1]?.value.raw ?? "";
      if (expr?.type === "Identifier" && after.includes(":hover &")) {
        hasComponentSelector = true;
      }
    }
  });

  if (hasComponentSelector) {
    warnings.push({
      type: "unsupported-feature",
      feature: "component-selector",
      message:
        "Component selectors like `${OtherComponent}:hover &` are not directly representable in StyleX. Manual refactor is required to preserve relationship/hover semantics.",
    });
  }

  if (hasSpecificityHack) {
    warnings.push({
      type: "unsupported-feature",
      feature: "specificity",
      message:
        "Styled-components specificity hacks like `&&` / `&&&` are not representable in StyleX. The output may not preserve selector specificity and may require manual adjustments.",
    });
  }

  const { styled: styledIdentifiers } = getStyledIdentifiers(j, root);
  if (styledIdentifiers.size > 0) {
    root.find(j.TaggedTemplateExpression).forEach((path) => {
      if (!isStyledTemplate(path.node, styledIdentifiers)) return;

      const quasi = path.node.quasi;
      try {
        const parsed = parseTemplateLiteral(quasi);
        const contexts = findDynamicContexts(parsed);
        const results = runDynamicPlugins(contexts, dynamicPlugins);
        warnings.push(...collectDynamicWarnings(results));
        warnings.push(...collectUnclassifiedDynamicWarnings(parsed, contexts));
      } catch (error) {
        const err = error as Error;
        warnings.push({
          type: "unsupported-feature",
          feature: "css-parse", // general parse warning
          message: `Failed to parse styled-components template: ${err.message}`,
        });
      }
    });
  }

  return {
    code: null,
    warnings,
  };
}

// Re-export adapter types for convenience
export type { Adapter, AdapterContext } from "./adapter.js";
export { defaultAdapter } from "./adapter.js";
export {
  parseTemplateLiteral,
  findDynamicContexts,
  runDynamicPlugins,
  collectDynamicWarnings,
  collectUnclassifiedDynamicWarnings,
};

/**
 * Shared babel parser for prepass modules.
 *
 * Uses @babel/parser directly with `tokens: false` for ~35% faster parsing
 * compared to jscodeshift's getParser (which enables token generation).
 *
 * Both scan-cross-file-selectors and extract-external-interface can share this parser
 * to avoid duplicate parser initialization.
 */
import { parse, type ParserPlugin } from "@babel/parser";

/* ── Public types ─────────────────────────────────────────────────────── */

/** Minimal AST node shape for raw babel parser output. */
export type AstNode = Record<string, unknown> & { type?: string };

/** Parser name matching jscodeshift's parser option. */
export type PrepassParserName = "babel" | "babylon" | "flow" | "ts" | "tsx";

/** Parser interface: parse source code into a babel AST. */
interface PrepassParser {
  parse: (source: string) => unknown;
}

/* ── Public API ───────────────────────────────────────────────────────── */

/**
 * Create a babel parser with tokens disabled, matching jscodeshift's plugin set
 * for the given parser name.
 *
 * - `tsx` / `ts`: TypeScript plugins (tsx also includes JSX)
 * - `babel` / `babylon` / `flow`: Flow plugins + JSX
 *
 * Note: jscodeshift's `flow` parser uses the `flow-parser` package (not babel).
 * We always use `@babel/parser` with the `flow` plugin instead, since it produces
 * the same AST node types (ImportDeclaration, TaggedTemplateExpression) that the
 * prepass walks, and avoids an extra parser dependency.
 */
export function createPrepassParser(parserName: PrepassParserName = "tsx"): PrepassParser {
  const options =
    parserName === "ts" || parserName === "tsx"
      ? buildOptions(TS_PLUGINS, parserName === "tsx")
      : buildOptions(FLOW_PLUGINS, true);

  return {
    parse(source: string) {
      return parse(source, options);
    },
  };
}

/* ── Parser options ───────────────────────────────────────────────────── */

function buildOptions(plugins: ParserPlugin[], includeJsx: boolean) {
  const allPlugins = includeJsx ? (["jsx", ...plugins] satisfies ParserPlugin[]) : plugins;
  return {
    sourceType: "module" as const,
    allowImportExportEverywhere: true,
    allowReturnOutsideFunction: true,
    startLine: 1,
    tokens: false,
    plugins: allPlugins,
  };
}

/**
 * Plugins for TypeScript parsers (ts, tsx).
 * Same as jscodeshift's tsOptions.plugins minus "jsx" (added conditionally).
 */
const TS_PLUGINS: ParserPlugin[] = [
  "asyncGenerators",
  "decoratorAutoAccessors",
  "bigInt",
  "classPrivateMethods",
  "classPrivateProperties",
  "classProperties",
  "decorators-legacy",
  "doExpressions",
  "dynamicImport",
  "exportDefaultFrom",
  "exportNamespaceFrom",
  "functionBind",
  "functionSent",
  "importAttributes",
  "importMeta",
  "nullishCoalescingOperator",
  "numericSeparator",
  "objectRestSpread",
  "optionalCatchBinding",
  "optionalChaining",
  ["pipelineOperator", { proposal: "minimal" }],
  "throwExpressions",
  "typescript",
];

/**
 * Plugins for Flow/Babylon parsers (babel, babylon, flow).
 * Same as jscodeshift's babylon parser plugins minus "jsx" (added conditionally).
 */
const FLOW_PLUGINS: ParserPlugin[] = [
  ["flow", { all: true }],
  "flowComments",
  "asyncGenerators",
  "bigInt",
  "classProperties",
  "classPrivateProperties",
  "classPrivateMethods",
  ["decorators", { decoratorsBeforeExport: false }],
  "doExpressions",
  "dynamicImport",
  "exportDefaultFrom",
  "exportNamespaceFrom",
  "functionBind",
  "functionSent",
  "importMeta",
  "logicalAssignment",
  "nullishCoalescingOperator",
  "numericSeparator",
  "objectRestSpread",
  "optionalCatchBinding",
  "optionalChaining",
  ["pipelineOperator", { proposal: "minimal" }],
  "throwExpressions",
];

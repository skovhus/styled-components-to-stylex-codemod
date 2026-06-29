/**
 * Logger and warning types for transform diagnostics.
 * Core concepts: severity classification and source context reporting.
 */
import { readFileSync } from "node:fs";
import { createAstSafeJsonReplacer } from "./utilities/ast-safety.js";

type Severity = "info" | "warning" | "error";

export type WarningType =
  | "`css` helper function switch must return css templates in all branches"
  | "`css` helper usage as a function call (css(...)) is not supported"
  | "`css` helper used outside of a styled component template cannot be statically transformed"
  | "Adapter helper call in border interpolation did not resolve to a single CSS value"
  | "Adapter resolveCall returned an unparseable styles expression"
  | "Adapter resolveCall returned an unparseable value expression"
  | "Adapter resolveCall returned StyleX styles for helper call where a CSS value was expected"
  | "Adapter resolved an imported helper call as StyleX styles without replacing the RuleSet helper"
  | "Adapter resolveCall returned undefined for helper call"
  | "Adapter resolveBaseComponent threw an error"
  | "Adapter resolved StyleX styles cannot be applied under nested selectors/at-rules"
  | "Adapter resolved StyleX styles inside pseudo selector but did not provide cssText for property expansion — add cssText to resolveCall result to enable pseudo-wrapping"
  | "Adapter resolved imported StyleX value under nested selectors/at-rules but did not provide cssText for property expansion — add cssText to resolveValue result to enable pseudo-wrapping"
  | 'Adapter resolveCall cssText could not be parsed as CSS declarations — expected semicolon-separated property: value pairs (e.g. "white-space: nowrap; overflow: hidden;")'
  | 'Adapter resolveValue cssText could not be parsed as CSS declarations — expected semicolon-separated property: value pairs (e.g. "white-space: nowrap; overflow: hidden;")'
  | "Adapter resolveValue returned an unparseable value expression"
  | "Adapter resolveValue returned undefined for imported value"
  | "Imported constant cannot be referenced inside stylex.create() — move it into a `.stylex` defineConsts/defineVars group (or map it via adapter.resolveValue)"
  | "Arrow function: body is not a recognized pattern (expected ternary, logical, call, or member expression)"
  | "Arrow function: conditional branches could not be resolved to static or theme values"
  | "Arrow function: helper call body is not supported"
  | "Arrow function: indexed theme lookup pattern not matched"
  | "Arrow function: logical expression pattern not supported"
  | "Arrow function: prop access cannot be converted to style function for this CSS property"
  | "Arrow function: theme access path could not be resolved"
  | "Component selectors like `${OtherComponent}:hover &` are not directly representable in StyleX. Manual refactor is required"
  | "Conditional `css` block: !important is not supported in StyleX"
  | "Conditional `css` block: unsupported or mixed @-rules require manual handling"
  | "CSS block contains unsupported at-rule (only @media, @container, and @supports are supported; mixed nested at-rules require manual handling)"
  | "Conditional `css` block: dynamic interpolation could not be resolved to a single component prop"
  | "Conditional `css` block: failed to parse expression"
  | "Conditional `css` block: missing CSS property name"
  | "Conditional `css` block: missing interpolation expression"
  | "Conditional `css` block: mixed static/dynamic values with non-theme expressions cannot be safely transformed"
  | "Conditional `css` block: multiple interpolation slots in a single property value"
  | "Conditional `css` block: finite ternary before a later overlapping declaration requires manual source-order handling"
  | "Conditional `css` block: runtime pseudo-alias styles are not supported"
  | "Conditional `css` block: ternary branch value could not be resolved (imported values require adapter support)"
  | "Conditional `css` block: ternary expressions inside pseudo selectors are not supported"
  | "Conditional `css` block: media query interpolation must be a simple imported reference (expressions like `value + 1` are not supported)"
  | "Conditional `css` block: unsupported selector"
  | "Directional border helper styles are not supported"
  | "Multi-slot border interpolation could not be resolved"
  | "Resolved border helper value could not be expanded to longhand properties"
  | "Resolved conditional border variant could not be expanded to longhand properties"
  | "createGlobalStyle is not supported in StyleX. Global styles should be handled separately (e.g., in a CSS file or using CSS reset libraries)"
  | "Failed to parse theme expressions"
  | "Heterogeneous background values (mix of gradients and colors) not currently supported"
  | "Higher-order styled factory wrappers (e.g. hoc(styled)) are not supported"
  | "Imported CSS helper mixins: cannot determine inherited properties for correct pseudo selector handling"
  | "Local helper function returns CSS that cannot be decomposed into individual properties"
  | "Local helper function computes CSS values that cannot be statically traced to the component prop"
  | "Unsupported background shorthand: multiple components cannot be mapped to a single StyleX longhand"
  | "Styled-components specificity hacks like `&&` / `&&&` are not representable in StyleX"
  | "Theme-dependent block-level conditional could not be fully resolved (branches may contain dynamic interpolations)"
  | "Theme-dependant call expression could not be resolved (e.g. theme helper calls like theme.highlight() are not supported)"
  | "Theme value with fallback (props.theme.X ?? / || default) cannot be resolved statically — use adapter.resolveValue to map theme paths to StyleX tokens"
  | "Theme-dependent nested prop access requires a project-specific theme source (e.g. useTheme())"
  | "Theme-dependent template literals require a project-specific theme source (e.g. useTheme())"
  | "Theme prop overrides on styled components are not supported"
  | "Universal selectors (`*`) are currently unsupported"
  | "Unsupported call expression (expected imported helper(...) or imported helper(...)(...))"
  | "Unsupported conditional test in shouldForwardProp"
  | "Unsupported .attrs() callback pattern"
  | "Unsupported .attrs() object value"
  | "Unsupported .attrs() object/array value on a styled component sharing a multi-declarator statement"
  | "Unsupported shouldForwardProp pattern (only !prop.startsWith(), ![].includes(prop), and prop !== are supported)"
  | "Unsupported interpolation: arrow function"
  | "Unsupported interpolation: call expression"
  | "Unsupported interpolation: identifier"
  | "css helper with prop-based interpolation cannot be reused as a mixin"
  | "Unsupported interpolation: member expression"
  | "Unsupported interpolation: multiple dynamic slots in one declaration"
  | "Unsupported interpolation: property"
  | "Unsupported interpolation: unknown"
  | `Unsupported CSS property "${string}" cannot be emitted in StyleX`
  | "Dynamic logical scroll shorthand cannot be expanded — bind a specific longhand (e.g. scroll-padding-inline-start) instead"
  | "Imported runtime condition root collides with a component prop of the same name"
  | "Mixed logical and physical scroll properties cannot be normalized without a known writing-mode"
  | "Unsupported nested conditional interpolation"
  | "Unsupported prop-based inline style expression cannot be safely inlined"
  | "Unsupported prop-based inline style props.theme access is not supported"
  | "Unsupported selector interpolation: imported value in selector position"
  | "Unsupported: media query interpolation must be a simple imported reference (expressions like `value + 1` are not supported)"
  | "Unsupported selector: class selector"
  | "Unsupported selector: comma-separated selectors must all be simple pseudos or pseudo-elements"
  | "Unsupported selector: descendant pseudo selector (space before pseudo)"
  | "Unsupported selector: adjacent sibling combinator"
  | "Unsupported selector: descendant/child/sibling selector"
  | "Unsupported selector: conditional css block inside pseudo-element selector"
  | "Unsupported selector: interpolated pseudo selector"
  | "Unsupported selector: pseudo-class on pseudo-element selector"
  | "Unsupported selector: unsupported pseudo-element"
  | "Unsupported selector: sibling combinator"
  | "Unsupported selector: unresolved interpolation in sibling selector"
  | "Unsupported selector: ambiguous element selector"
  | "Unsupported selector: attribute selector on unsupported element"
  | "Unsupported selector: element selector on exported component"
  | "Unsupported selector: element selector with combined ancestor and child pseudos"
  | "Unsupported selector: element selector with dynamic children"
  | "Unsupported selector: element selector with plain intrinsic children"
  | "Unsupported selector: element selector pseudo collision"
  | "Unsupported selector: cross-file component selector target has no JSX usage in this file"
  | "Unsupported selector: unresolved interpolation in cross-file component selector"
  | "Unsupported selector: unresolved interpolation in descendant component selector"
  | "Unsupported selector: unresolved interpolation in attribute selector"
  | "Unsupported selector: unresolved interpolation in element selector"
  | "Unsupported selector: unresolved interpolation in reverse component selector"
  | "Unsupported selector: unresolved interpolation in cross-component sibling selector"
  | "Unsupported selector: grouped reverse selector references different components"
  | "Unsupported selector: computed media query inside ancestor attribute selector"
  | "Unsupported selector: computed media query inside cross-component sibling selector"
  | "Unsupported selector: computed media query inside sibling selector"
  | "Unsupported selector: computed media query inside :has() component selector"
  | "Unsupported: a property combines a computed at-rule key (from resolveSelector) with a static at-rule key on the same property — StyleX emits computed keys last, so the original cascade order between the at-rules cannot be preserved"
  | "Unsupported selector: cross-file :has() component selector not yet supported"
  | "Unsupported selector: unresolved interpolation in :has() component selector"
  | "Unsupported selector: unknown component selector"
  | "Unsupported selector: component selector with child pseudo"
  | "Unsupported selector: component selector target has no patchable JSX usage under selector parent"
  | "Unsupported selector: compound pseudo selector"
  | "Unsupported css`` mixin: after-base mixin style is not a plain object"
  | "Unsupported css`` mixin: nested contextual conditions in after-base mixin"
  | "Unsupported css`` mixin: cannot infer base default for after-base contextual override (base value is non-literal)"
  | "css`` helper function interpolation references closure variable that cannot be hoisted"
  | "Using styled-components components as mixins is not supported; use css`` mixins or strings instead"
  | "Partial migration left styled-components declarations unconverted"
  | "styled(ImportedComponent) wraps a component whose file uses styled-components — convert the base component's file first to avoid CSS cascade conflicts"
  | "Partial transform would have a StyleX leaf wrap a styled-components base — the extending component was transformed but its base was not, so the leaf's StyleX overrides cannot reliably beat the base's styled-components styles"
  | "Partial transform would leave a StyleX child reveal targeting a styled-components ancestor — the component-selector ancestor was not converted, so it cannot render the marker the child's stylex.when.ancestor() reveal needs; the child is preserved as styled-components to keep the reveal working"
  | "Conditional StyleX default would override an unproven earlier style for the same property"
  | "Flat StyleX value would erase earlier conditional property states"
  | "Forwarded sx conditional default would override an unproven wrapped component base style"
  | "Wrapped component does not accept className or sx for generated StyleX styles"
  | "Wrapped component sx prop targets an inner element for a root style property"
  | "Wrapped component sx prop rejects logical CSS properties that cannot be preserved losslessly"
  | "Wrapped component sx prop does not accept generated StyleX property"
  | "Transient $-prefixed props renamed on exported component — update consumer call sites to use the new prop names"
  | "Shorthand property has an opaque value that StyleX will expand to longhands — use `directional` in resolveValue to return separate longhand tokens"
  | "animation shorthand contains a var() with no classifiable fallback — its longhand position cannot be determined statically; bind the variable to a specific longhand (e.g. animation-duration: var(--x)) instead";

export const CASCADE_CONFLICT_WARNING =
  "styled(ImportedComponent) wraps a component whose file uses styled-components — convert the base component's file first to avoid CSS cascade conflicts" satisfies WarningType;

export const PARTIAL_MIGRATION_INCOMPLETE_WARNING =
  "Partial migration left styled-components declarations unconverted" satisfies WarningType;

export const PARTIAL_PRESERVED_ANCESTOR_REVEAL_WARNING =
  "Partial transform would leave a StyleX child reveal targeting a styled-components ancestor — the component-selector ancestor was not converted, so it cannot render the marker the child's stylex.when.ancestor() reveal needs; the child is preserved as styled-components to keep the reveal working" satisfies WarningType;

export const UNSUPPORTED_SHOULD_FORWARD_PROP_WARNING =
  "Unsupported shouldForwardProp pattern (only !prop.startsWith(), ![].includes(prop), and prop !== are supported)" satisfies WarningType;

export interface WarningLog {
  severity: Severity;
  type: WarningType;
  loc: { line: number; column: number } | null | undefined;
  context?: Record<string, unknown>;
}

export interface CollectedWarning extends WarningLog {
  filePath: string;
}

// ────────────────────────────────────────────────────────────────────────────
// Logger
// ────────────────────────────────────────────────────────────────────────────

/**
 * When fileCount <= this threshold, warnings are printed per-file inline and
 * the summary is skipped. Above the threshold only the summary is printed.
 */
const FILE_COUNT_INLINE_THRESHOLD = 10;

export class Logger {
  /**
   * Set the total number of files being transformed.
   * Controls whether warnings are printed per-file or only in the summary.
   */
  public static setFileCount(count: number): void {
    Logger.fileCount = count;
  }

  /**
   * Set the maximum number of examples shown per warning category in the summary.
   */
  public static setMaxExamples(count: number): void {
    Logger.maxExamples = count;
  }

  /**
   * Log an informational message to stderr (e.g. prepass summary).
   * Routed through Logger so tests can mock it.
   */
  public static info(message: string): void {
    process.stderr.write(message);
  }

  /**
   * Log a warning message to stdout.
   * All codemod warnings go through this so tests can mock it.
   */
  public static warn(message: string, context?: unknown): void {
    Logger.writeWithSpacing(message, context);
  }

  /**
   * Mark an Error instance as already logged so downstream catch blocks can skip it.
   */
  public static markErrorAsLogged(e: unknown): void {
    if (e instanceof Error) {
      Logger.loggedErrors.add(e);
    }
  }

  /**
   * Check whether an error was already logged via `markErrorAsLogged`.
   */
  public static isErrorLogged(e: unknown): boolean {
    return e instanceof Error && Logger.loggedErrors.has(e);
  }

  /**
   * Log an error message to stdout with file path and optional location.
   * Formats like warnings: "Error filepath:line:column\nmessage"
   * Always prints regardless of file count.
   */
  public static logError(
    message: string,
    filePath: string,
    loc?: { line: number; column: number },
    context?: unknown,
  ): void {
    const location = loc ? `${filePath}:${loc.line}:${loc.column}` : filePath;
    const label = Logger.colorizeErrorLabel("Error");
    Logger.writeWithSpacing(`${label} ${location}\n${message}`, context);
  }

  /**
   * Collect transform warnings and optionally print them per-file.
   * Per-file output is shown when fileCount is unknown or <= threshold.
   * When fileCount > threshold, warnings are only collected for the summary.
   */
  public static logWarnings(
    warnings: WarningLog[],
    filePath: string,
    options: { silent?: boolean } = {},
  ): void {
    const printInline =
      !options.silent &&
      (Logger.fileCount === null || Logger.fileCount <= FILE_COUNT_INLINE_THRESHOLD);
    for (const warning of warnings) {
      Logger.collected.push({ ...warning, filePath });
      if (printInline) {
        const location = warning.loc
          ? `${filePath}:${warning.loc.line}:${warning.loc.column}`
          : `${filePath}`;
        const label = Logger.colorizeSeverityLabel(warning.severity);
        Logger.writeWithSpacing(`${label} ${location}\n${warning.type}`, warning.context);
      }
    }
  }

  /**
   * Create a report from all collected warnings.
   */
  public static createReport(): LoggerReport {
    return new LoggerReport([...Logger.collected], Logger.fileCount, Logger.maxExamples);
  }

  /**
   * Restore the collected warnings to a previous snapshot (from
   * `createReport().getWarnings()`). Used to undo the side effects of an
   * analysis-only dry run on the process-global logger.
   */
  public static restoreWarnings(warnings: CollectedWarning[]): void {
    Logger.collected = [...warnings];
  }

  /** @internal - for testing only */
  public static _clearCollected(): void {
    Logger.collected = [];
    Logger.fileCount = null;
    Logger.loggedErrors = new WeakSet<Error>();
  }

  // -- Internal state

  private static collected: CollectedWarning[] = [];
  private static fileCount: number | null = null;
  private static maxExamples = 3;
  private static loggedErrors = new WeakSet<Error>();

  private static writeWithSpacing(message: string, context?: unknown): void {
    const trimmed = message.replace(/\s+$/u, "");
    const serialized = Logger.formatContext(context);
    process.stdout.write(`${trimmed}${serialized ? `\n${serialized}` : ""}\n\n`);
  }

  private static colorizeSeverityLabel(severity: Severity): string {
    if (severity === "error") {
      return Logger.colorizeErrorLabel("Error");
    }
    if (severity === "info") {
      return Logger.colorizeInfoLabel("Info");
    }
    return Logger.colorizeWarnLabel("Warning");
  }

  private static colorizeWarnLabel(label: string): string {
    if (!process.stdout.isTTY) {
      return label;
    }
    return `${WARN_BG_COLOR}${WARN_TEXT_COLOR}${label}${RESET_COLOR}`;
  }

  private static colorizeErrorLabel(label: string): string {
    if (!process.stdout.isTTY) {
      return label;
    }
    return `${ERROR_BG_COLOR}${ERROR_TEXT_COLOR}${label}${RESET_COLOR}`;
  }

  private static colorizeInfoLabel(label: string): string {
    if (!process.stdout.isTTY) {
      return label;
    }
    return `${INFO_BG_COLOR}${INFO_TEXT_COLOR}${label}${RESET_COLOR}`;
  }

  private static formatContext(context: unknown): string | null {
    if (typeof context === "undefined") {
      return null;
    }
    return JSON.stringify(context, createAstSafeJsonReplacer(), 2);
  }
}

// ────────────────────────────────────────────────────────────────────────────
// LoggerReport - formats and prints grouped warning reports
// ────────────────────────────────────────────────────────────────────────────

interface WarningWithSnippet extends WarningLog {
  filePath: string;
  snippet?: string;
}

interface WarningGroup {
  message: string;
  warnings: WarningWithSnippet[];
}

interface DependedFileGroup {
  dependedFilePath: string;
  usageFiles: string[];
}

const MAX_DEPENDED_FILE_GROUPS = 15;

class LoggerReport {
  private readonly warnings: CollectedWarning[];
  private readonly fileCount: number | null;
  private readonly maxExamples: number;
  private fileCache = new Map<string, string[] | null>();

  constructor(warnings: CollectedWarning[], fileCount: number | null, maxExamples = 3) {
    this.warnings = warnings;
    this.fileCount = fileCount;
    this.maxExamples = maxExamples;
  }

  getWarnings(): CollectedWarning[] {
    return this.warnings;
  }

  /**
   * Get the formatted report as a string.
   */
  toString(): string {
    if (this.warnings.length === 0) {
      return "";
    }

    const lines: string[] = [];
    const groups = this.groupWarnings();

    lines.push("");
    lines.push("─".repeat(60));
    lines.push(
      `Warning Summary: ${this.warnings.length} warning(s) in ${groups.length} category(s)`,
    );
    lines.push("─".repeat(60));

    const MAX_EXAMPLES = this.maxExamples;

    for (const group of groups) {
      lines.push("");
      lines.push(`▸ ${group.message} (${group.warnings.length})`);
      lines.push("");

      const dependedFileGroups = this.groupDependedFiles(group);
      if (dependedFileGroups.length > 0) {
        lines.push("  Top depended files:");
        lines.push("");
        for (const [index, dependedFileGroup] of dependedFileGroups.entries()) {
          const usageCount = dependedFileGroup.usageFiles.length;
          const usageLabel = usageCount === 1 ? "usage file" : "usage files";
          lines.push(
            `  ${index + 1}. ${dependedFileGroup.dependedFilePath} (${usageCount} ${usageLabel})`,
          );
          for (const usageFile of dependedFileGroup.usageFiles.slice(0, MAX_EXAMPLES)) {
            lines.push(`     ${usageFile}`);
          }
          const remainingUsageFiles = usageCount - MAX_EXAMPLES;
          if (remainingUsageFiles > 0) {
            lines.push(`     ... and ${remainingUsageFiles} more usage file(s)`);
          }
          lines.push("");
        }
      }

      // Deduplicate by file path - only show first occurrence per file
      const seenFiles = new Set<string>();
      const uniqueLocations: WarningWithSnippet[] = [];
      for (const loc of group.warnings) {
        if (!seenFiles.has(loc.filePath)) {
          seenFiles.add(loc.filePath);
          uniqueLocations.push(loc);
        }
      }

      const displayed = uniqueLocations.slice(0, MAX_EXAMPLES);
      for (const loc of displayed) {
        const location = loc.loc
          ? `${loc.filePath}:${loc.loc.line}:${loc.loc.column}`
          : loc.filePath;
        lines.push(`  ${location}`);
        if (loc.snippet) {
          lines.push(loc.snippet);
        }
        lines.push("");
      }

      const remaining = uniqueLocations.length - MAX_EXAMPLES;
      if (remaining > 0) {
        lines.push(`  ... and ${remaining} more file(s)`);
        lines.push("");
      }
    }

    return lines.join("\n");
  }

  /**
   * Print the formatted warning report to stdout.
   * Skips the summary when fileCount <= threshold (warnings already shown inline).
   */
  print(): void {
    if (this.fileCount !== null && this.fileCount <= FILE_COUNT_INLINE_THRESHOLD) {
      return;
    }
    const output = this.toString();
    if (output) {
      // Add color codes for terminal output
      const colored = output.replace(
        /▸ (.+?) \((\d+)\)/g,
        `${SECTION_COLOR}▸ $1 ($2)${RESET_COLOR}`,
      );
      process.stdout.write(colored + "\n");
    }
  }

  private groupWarnings(): WarningGroup[] {
    const groupMap = new Map<string, WarningGroup>();

    for (const warning of this.warnings) {
      const enrichedWarning: WarningWithSnippet = {
        ...warning,
        snippet: warning.loc ? this.getSnippet(warning.filePath, warning.loc) : undefined,
      };

      const existing = groupMap.get(warning.type);
      if (existing) {
        existing.warnings.push(enrichedWarning);
      } else {
        groupMap.set(warning.type, {
          message: warning.type,
          warnings: [enrichedWarning],
        });
      }
    }

    // Sort groups by count (most frequent first)
    return Array.from(groupMap.values()).sort((a, b) => b.warnings.length - a.warnings.length);
  }

  private groupDependedFiles(group: WarningGroup): DependedFileGroup[] {
    if (group.message !== CASCADE_CONFLICT_WARNING) {
      return [];
    }

    const groupMap = new Map<string, WarningWithSnippet[]>();
    for (const warning of group.warnings) {
      const dependedFilePath = getCascadeDependedFilePath(warning);
      if (!dependedFilePath) {
        continue;
      }
      const dependedFileWarnings = groupMap.get(dependedFilePath) ?? [];
      dependedFileWarnings.push(warning);
      groupMap.set(dependedFilePath, dependedFileWarnings);
    }

    return Array.from(groupMap.entries())
      .map(([dependedFilePath, warnings]) => ({
        dependedFilePath,
        usageFiles: uniqueSorted(warnings.map((warning) => warning.filePath)),
      }))
      .sort((a, b) => b.usageFiles.length - a.usageFiles.length)
      .slice(0, MAX_DEPENDED_FILE_GROUPS);
  }

  private getSnippet(filePath: string, loc?: { line: number; column: number }): string | undefined {
    if (!loc) {
      return undefined;
    }
    const lines = this.getFileLines(filePath);
    if (!lines) {
      return undefined;
    }

    const lineIndex = loc.line - 1; // Convert to 0-based
    if (lineIndex < 0 || lineIndex >= lines.length) {
      return undefined;
    }

    const snippetLines: string[] = [];
    // Include 2 lines above, the problematic line, and 4 lines below
    const startLine = Math.max(0, lineIndex - 2);
    const endLine = Math.min(lines.length - 1, lineIndex + 4);
    for (let i = startLine; i <= endLine; i++) {
      const lineNum = String(i + 1).padStart(4, " ");
      const marker = i === lineIndex ? ">" : " ";
      snippetLines.push(`  ${marker} ${lineNum} | ${lines[i]}`);
    }
    return snippetLines.join("\n");
  }

  private getFileLines(filePath: string): string[] | null {
    if (this.fileCache.has(filePath)) {
      return this.fileCache.get(filePath) ?? null;
    }
    try {
      const content = readFileSync(filePath, "utf-8");
      const lines = content.split("\n");
      this.fileCache.set(filePath, lines);
      return lines;
    } catch {
      this.fileCache.set(filePath, null);
      return null;
    }
  }
}

/**
 * Extract the depended-on file path from a cascade-conflict warning's context
 * (the base component's defining file that must be converted first). Owned here
 * alongside the warning-type definition so consumers share one invariant.
 */
export function getCascadeDependedFilePath(warning: WarningLog): string | undefined {
  const context = warning.context;
  if (!context) {
    return undefined;
  }
  if (typeof context.definitionPath === "string") {
    return context.definitionPath;
  }
  return typeof context.importedPath === "string" ? context.importedPath : undefined;
}

function uniqueSorted(values: string[]): string[] {
  return Array.from(new Set(values)).sort((a, b) => a.localeCompare(b));
}

const WARN_BG_COLOR = "\u001b[43m";
const WARN_TEXT_COLOR = "\u001b[30m";
const ERROR_BG_COLOR = "\u001b[41m";
const ERROR_TEXT_COLOR = "\u001b[37m";
const INFO_BG_COLOR = "\u001b[44m";
const INFO_TEXT_COLOR = "\u001b[37m";
const SECTION_COLOR = "\u001b[36m";
const RESET_COLOR = "\u001b[0m";

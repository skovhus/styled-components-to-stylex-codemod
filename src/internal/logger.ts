/**
 * Logger and warning types for transform diagnostics.
 * Core concepts: severity classification and source context reporting.
 */
import { readFileSync } from "node:fs";

type Severity = "info" | "warning" | "error";

export type WarningType =
  | "`css` helper function switch must return css templates in all branches"
  | "`css` helper usage as a function call (css(...)) is not supported"
  | "`css` helper used outside of a styled component template cannot be statically transformed"
  | "Adapter helper call in border interpolation did not resolve to a single CSS value"
  | "Adapter resolveCall returned an unparseable styles expression"
  | "Adapter resolveCall returned an unparseable value expression"
  | "Adapter resolveCall returned StyleX styles for helper call where a CSS value was expected"
  | "Adapter resolveCall returned undefined for helper call"
  | "Adapter resolved StyleX styles cannot be applied under nested selectors/at-rules"
  | "Adapter resolved StyleX styles inside pseudo selector but did not provide cssText for property expansion — add cssText to resolveCall result to enable pseudo-wrapping"
  | 'Adapter resolveCall cssText could not be parsed as CSS declarations — expected semicolon-separated property: value pairs (e.g. "white-space: nowrap; overflow: hidden;")'
  | "Adapter resolveValue returned an unparseable value expression"
  | "Adapter resolveValue returned undefined for imported value"
  | "Arrow function: body is not a recognized pattern (expected ternary, logical, call, or member expression)"
  | "Arrow function: conditional branches could not be resolved to static or theme values"
  | "Arrow function: helper call body is not supported"
  | "Arrow function: indexed theme lookup pattern not matched"
  | "Arrow function: logical expression pattern not supported"
  | "Arrow function: prop access cannot be converted to style function for this CSS property"
  | "Arrow function: theme access path could not be resolved"
  | "Component selectors like `${OtherComponent}:hover &` are not directly representable in StyleX. Manual refactor is required"
  | "Conditional `css` block: !important is not supported in StyleX"
  | "Conditional `css` block: @-rules (e.g., @media, @supports) are not supported"
  | "Conditional `css` block: failed to parse expression"
  | "Conditional `css` block: missing CSS property name"
  | "Conditional `css` block: missing interpolation expression"
  | "Conditional `css` block: mixed static/dynamic values with non-theme expressions cannot be safely transformed"
  | "Conditional `css` block: multiple interpolation slots in a single property value"
  | "Conditional `css` block: ternary branch value could not be resolved (imported values require adapter support)"
  | "Conditional `css` block: ternary expressions inside pseudo selectors are not supported"
  | "Conditional `css` block: unsupported selector"
  | "Directional border helper styles are not supported"
  | "createGlobalStyle is not supported in StyleX. Global styles should be handled separately (e.g., in a CSS file or using CSS reset libraries)"
  | "Dynamic styles inside pseudo elements (::before/::after) are not supported by StyleX. See https://github.com/facebook/stylex/issues/1396"
  | "Failed to parse theme expressions"
  | "Heterogeneous background values (mix of gradients and colors) not currently supported"
  | "Higher-order styled factory wrappers (e.g. hoc(styled)) are not supported"
  | "Imported CSS helper mixins: cannot determine inherited properties for correct pseudo selector handling"
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
  | "Unsupported shouldForwardProp pattern (only !prop.startsWith(), ![].includes(prop), and prop !== are supported)"
  | "Unsupported interpolation: arrow function"
  | "Unsupported interpolation: call expression"
  | "Unsupported interpolation: identifier"
  | "Unsupported interpolation: member expression"
  | "Unsupported interpolation: property"
  | "Unsupported interpolation: unknown"
  | "Unsupported nested conditional interpolation"
  | "Unsupported prop-based inline style expression cannot be safely inlined"
  | "Unsupported prop-based inline style props.theme access is not supported"
  | "Unsupported selector interpolation: imported value in selector position"
  | "Unsupported selector: class selector"
  | "Unsupported selector: comma-separated selectors must all be simple pseudos"
  | "Unsupported selector: descendant pseudo selector (space before pseudo)"
  | "Unsupported selector: descendant/child/sibling selector"
  | "Unsupported selector: interpolated pseudo selector"
  | "Unsupported selector: sibling combinator"
  | "Unsupported selector: attribute selector on unsupported element"
  | "Unsupported selector: sibling combinator with interpolated values"
  | "Unsupported selector: unknown component selector"
  | "Unsupported css`` mixin: after-base mixin style is not a plain object"
  | "Unsupported css`` mixin: nested contextual conditions in after-base mixin"
  | "Unsupported css`` mixin: cannot infer base default for after-base contextual override (base value is non-literal)"
  | "css`` helper function interpolation references closure variable that cannot be hoisted"
  | "Using styled-components components as mixins is not supported; use css`` mixins or strings instead";

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

export class Logger {
  /**
   * Log a warning message to stdout.
   * All codemod warnings go through this so tests can mock it.
   */
  public static warn(message: string, context?: unknown): void {
    Logger.writeWithSpacing(message, context);
  }

  /**
   * Log an error message to stdout with file path and optional location.
   * Formats like warnings: "Error filepath:line:column\nmessage"
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
   * Log transform warnings to stdout and collect them.
   */
  public static logWarnings(warnings: WarningLog[], filePath: string): void {
    for (const warning of warnings) {
      Logger.collected.push({ ...warning, filePath });
      const location = warning.loc
        ? `${filePath}:${warning.loc.line}:${warning.loc.column}`
        : `${filePath}`;
      const label = Logger.colorizeSeverityLabel(warning.severity);
      Logger.writeWithSpacing(`${label} ${location}\n${warning.type}`, warning.context);
    }
  }

  /**
   * Create a report from all collected warnings.
   */
  public static createReport(): LoggerReport {
    return new LoggerReport([...Logger.collected]);
  }

  /** @internal - for testing only */
  public static _clearCollected(): void {
    Logger.collected = [];
  }

  // -- Internal state

  private static collected: CollectedWarning[] = [];

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
    return JSON.stringify(context, null, 2);
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

class LoggerReport {
  private readonly warnings: CollectedWarning[];
  private fileCache = new Map<string, string[] | null>();

  constructor(warnings: CollectedWarning[]) {
    this.warnings = warnings;
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

    const MAX_EXAMPLES = 15;

    for (const group of groups) {
      lines.push("");
      lines.push(`▸ ${group.message} (${group.warnings.length})`);
      lines.push("");

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
   */
  print(): void {
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

const WARN_BG_COLOR = "\u001b[43m";
const WARN_TEXT_COLOR = "\u001b[30m";
const ERROR_BG_COLOR = "\u001b[41m";
const ERROR_TEXT_COLOR = "\u001b[37m";
const INFO_BG_COLOR = "\u001b[44m";
const INFO_TEXT_COLOR = "\u001b[37m";
const SECTION_COLOR = "\u001b[36m";
const RESET_COLOR = "\u001b[0m";

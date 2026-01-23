import { readFileSync } from "node:fs";

type Severity = "info" | "warning" | "error";

export type WarningType =
  | "`css` helper usage as a function call (css(...)) is not supported"
  | "`css` helper used outside of a styled component template cannot be statically transformed"
  | "Adapter resolved StyleX styles cannot be applied under nested selectors/at-rules"
  | "Adapter returned an unparseable styles expression"
  | "Adapter returned null for helper call"
  | "Adapter.resolveCall must return { usage: 'props' | 'create', expr, imports }"
  | "Adapter.resolveCall returned null or undefined"
  | "Adapter.resolveValue returned undefined. This usually means your adapter forgot to return a value"
  | "Component selectors like `${OtherComponent}:hover &` are not directly representable in StyleX. Manual refactor is required"
  | "createGlobalStyle is not supported in StyleX. Global styles should be handled separately (e.g., in a CSS file or using CSS reset libraries)"
  | "Curried helper call resolved to usage 'create', use usage 'props' when the helper returns a StyleX style object"
  | "Failed to parse theme expressions"
  | "Heterogeneous background values (mix of gradients and colors) not currently supported"
  | "Imported CSS helper mixins: cannot determine inherited properties for correct pseudo selector handling"
  | "Styled-components specificity hacks like `&&` / `&&&` are not representable in StyleX"
  | "Theme-dependent conditional values require a project-specific theme source (e.g. useTheme())"
  | "Theme-dependent nested prop access requires a project-specific theme source (e.g. useTheme())"
  | "ThemeProvider conversion needs to be handled manually"
  | "Universal selectors (`*`) are currently unsupported"
  | "Unsupported call expression (expected imported helper(...) or imported helper(...)(...))"
  | "Unsupported conditional test in shouldForwardProp"
  | "Unsupported interpolation: unknown"
  | "Unsupported interpolation: property"
  | "Unsupported interpolation: identifier"
  | "Unsupported interpolation: member expression"
  | "Unsupported interpolation: call expression"
  | "Unsupported interpolation: arrow function"
  | "Unsupported nested conditional interpolation"
  | "Unsupported prop-based inline style expression cannot be safely inlined"
  | "Unsupported prop-based inline style props.theme access is not supported"
  | "Unsupported selector: class selector"
  | "Unsupported selector: comma-separated selectors must all be simple pseudos"
  | "Unsupported selector: descendant pseudo selector (space before pseudo)"
  | "Unsupported selector: descendant/child/sibling selector";

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

export class LoggerReport {
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

    const MAX_EXAMPLES = 10;

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
    // Include 2 lines above, the problematic line, and 2 lines below
    const startLine = Math.max(0, lineIndex - 2);
    const endLine = Math.min(lines.length - 1, lineIndex + 2);
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

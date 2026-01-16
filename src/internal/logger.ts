type Severity = "info" | "warning" | "error";

export interface WarningLog {
  severity: Severity;
  type: "unsupported-feature" | "dynamic-node";
  message: string;
  loc?: { line: number; column: number };
  context?: unknown;
}

export interface CollectedWarning extends WarningLog {
  filePath: string;
}

export class Logger {
  public static flushWarnings(): CollectedWarning[] {
    const result = collected;
    collected = [];
    return result;
  }

  /**
   * Log a warning message to stderr.
   * All codemod warnings go through this so tests can mock it.
   */
  public static warn(message: string, context?: unknown): void {
    Logger.writeWithSpacing(message, context);
  }

  /**
   * Log an error message to stderr.
   */
  public static error(message: string, context?: unknown): void {
    Logger.writeWithSpacing(`${Logger.colorizeErrorLabel("Error")} ${message}`, context);
  }

  /**
   * Log transform warnings to stderr and collect them.
   */
  public static logWarnings(warnings: WarningLog[], filePath: string): void {
    for (const warning of warnings) {
      collected.push({ ...warning, filePath });
      const location = warning.loc
        ? `${filePath}:${warning.loc.line}:${warning.loc.column}`
        : `${filePath}`;
      const label = Logger.colorizeSeverityLabel(warning.severity);
      Logger.writeWithSpacing(`${label} ${location}\n${warning.message}`, warning.context);
    }
  }

  private static writeWithSpacing(message: string, context?: unknown): void {
    const trimmed = message.replace(/\s+$/u, "");
    const serialized = Logger.formatContext(context);
    process.stderr.write(`${trimmed}${serialized ? `\n${serialized}` : ""}\n\n`);
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
    if (!process.stderr.isTTY) {
      return label;
    }
    return `${WARN_BG_COLOR}${WARN_TEXT_COLOR}${label}${RESET_COLOR}`;
  }

  private static colorizeErrorLabel(label: string): string {
    if (!process.stderr.isTTY) {
      return label;
    }
    return `${ERROR_BG_COLOR}${ERROR_TEXT_COLOR}${label}${RESET_COLOR}`;
  }

  private static colorizeInfoLabel(label: string): string {
    if (!process.stderr.isTTY) {
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

let collected: CollectedWarning[] = [];

const WARN_BG_COLOR = "\u001b[43m";
const WARN_TEXT_COLOR = "\u001b[30m";
const ERROR_BG_COLOR = "\u001b[41m";
const ERROR_TEXT_COLOR = "\u001b[37m";
const INFO_BG_COLOR = "\u001b[44m";
const INFO_TEXT_COLOR = "\u001b[37m";
const RESET_COLOR = "\u001b[0m";

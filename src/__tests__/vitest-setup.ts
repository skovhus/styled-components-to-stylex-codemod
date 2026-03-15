/**
 * Vitest global setup: suppress noisy diagnostic output from the codemod
 * during test runs so that the agent reporter output stays clean.
 */
import { vi } from "vitest";

const originalStdoutWrite = process.stdout.write.bind(process.stdout);
const originalStderrWrite = process.stderr.write.bind(process.stderr);

const SUPPRESSED_PREFIXES = ["Prepass: ", "Processing ", "All done", "Results:", "Time elapsed"];

function isSuppressed(chunk: unknown): boolean {
  if (typeof chunk !== "string") {
    return false;
  }
  const trimmed = chunk.trimStart();
  return SUPPRESSED_PREFIXES.some((prefix) => trimmed.startsWith(prefix));
}

function isJscodeshiftNoise(chunk: unknown): boolean {
  if (typeof chunk !== "string") {
    return false;
  }
  const trimmed = chunk.trim();
  return /^\d+ (errors|unmodified|skipped|ok)$/u.test(trimmed);
}

vi.spyOn(process.stdout, "write").mockImplementation(
  (...args: Parameters<typeof process.stdout.write>) => {
    const chunk = args[0];
    if (isSuppressed(chunk) || isJscodeshiftNoise(chunk)) {
      return true;
    }
    return originalStdoutWrite(...args);
  },
);

vi.spyOn(process.stderr, "write").mockImplementation(
  (...args: Parameters<typeof process.stderr.write>) => {
    const chunk = args[0];
    if (isSuppressed(chunk) || isJscodeshiftNoise(chunk)) {
      return true;
    }
    return originalStderrWrite(...args);
  },
);

/**
 * Vitest global setup: mock Logger to suppress codemod diagnostic output
 * during test runs so that the agent reporter output stays clean.
 *
 * Tests that need the real Logger (e.g. logger.test.ts) should call
 * vi.unmock("../internal/logger.js") at the top of the file.
 */
import { vi } from "vitest";

vi.mock("../internal/logger.js", () => ({
  CASCADE_CONFLICT_WARNING:
    "styled(ImportedComponent) wraps a component whose file uses styled-components — convert the base component's file first to avoid CSS cascade conflicts",
  PARTIAL_MIGRATION_INCOMPLETE_WARNING:
    "Partial migration left styled-components declarations unconverted",
  UNSUPPORTED_SHOULD_FORWARD_PROP_WARNING:
    "Unsupported shouldForwardProp pattern (only !prop.startsWith(), ![].includes(prop), and prop !== are supported)",
  Logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    logError: vi.fn(),
    logWarnings: vi.fn(),
    createReport: vi.fn(() => ({
      toString: () => "",
      print: vi.fn(),
      getWarnings: vi.fn(() => []),
    })),
    restoreWarnings: vi.fn(),
    setFileCount: vi.fn(),
    setMaxExamples: vi.fn(),
    markErrorAsLogged: vi.fn(),
    isErrorLogged: vi.fn(() => false),
    _clearCollected: vi.fn(),
  },
}));

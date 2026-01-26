import { describe, it, expect, beforeEach, vi } from "vitest";
import { Logger } from "../internal/logger.js";

describe("Logger", () => {
  beforeEach(() => {
    Logger._clearCollected();
    vi.restoreAllMocks();
    // Suppress stdout during tests
    vi.spyOn(process.stdout, "write").mockImplementation(() => true);
  });

  describe("createReport().toString()", () => {
    it("returns empty string when no warnings", () => {
      expect(Logger.createReport().toString()).toBe("");
    });

    it("groups warnings by message", () => {
      Logger.logWarnings(
        [
          {
            severity: "warning",
            type: "Adapter returned an unparseable styles expression",
            loc: null,
          },
        ],
        "/path/a.tsx",
      );
      Logger.logWarnings(
        [
          {
            severity: "warning",
            type: "Adapter returned an unparseable styles expression",
            loc: null,
          },
        ],
        "/path/b.tsx",
      );
      Logger.logWarnings(
        [{ severity: "warning", type: "Unsupported selector: class selector", loc: null }],
        "/path/c.tsx",
      );

      expect(Logger.createReport().toString()).toMatchInlineSnapshot(`
        "
        ────────────────────────────────────────────────────────────
        Warning Summary: 3 warning(s) in 2 category(s)
        ────────────────────────────────────────────────────────────

        ▸ Adapter returned an unparseable styles expression (2)

          /path/a.tsx

          /path/b.tsx


        ▸ Unsupported selector: class selector (1)

          /path/c.tsx
        "
      `);
    });

    it("deduplicates files within a category", () => {
      Logger.logWarnings(
        [
          {
            severity: "warning",
            type: "Unsupported selector: class selector",
            loc: { line: 1, column: 0 },
          },
          {
            severity: "warning",
            type: "Unsupported selector: class selector",
            loc: { line: 5, column: 0 },
          },
        ],
        "/path/same.tsx",
      );

      expect(Logger.createReport().toString()).toMatchInlineSnapshot(`
        "
        ────────────────────────────────────────────────────────────
        Warning Summary: 2 warning(s) in 1 category(s)
        ────────────────────────────────────────────────────────────

        ▸ Unsupported selector: class selector (2)

          /path/same.tsx:1:0
        "
      `);
    });

    it("limits examples to 15 per category", () => {
      for (let i = 0; i < 17; i++) {
        Logger.logWarnings(
          [{ severity: "warning", type: "Unsupported selector: class selector", loc: null }],
          `/path/file${String(i).padStart(2, "0")}.tsx`,
        );
      }

      expect(Logger.createReport().toString()).toMatchInlineSnapshot(`
        "
        ────────────────────────────────────────────────────────────
        Warning Summary: 17 warning(s) in 1 category(s)
        ────────────────────────────────────────────────────────────

        ▸ Unsupported selector: class selector (17)

          /path/file00.tsx

          /path/file01.tsx

          /path/file02.tsx

          /path/file03.tsx

          /path/file04.tsx

          /path/file05.tsx

          /path/file06.tsx

          /path/file07.tsx

          /path/file08.tsx

          /path/file09.tsx

          /path/file10.tsx

          /path/file11.tsx

          /path/file12.tsx

          /path/file13.tsx

          /path/file14.tsx

          ... and 2 more file(s)
        "
      `);
    });
  });
});

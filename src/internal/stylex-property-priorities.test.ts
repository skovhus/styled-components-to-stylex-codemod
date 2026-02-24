/**
 * Cross-reference test that validates our shorthand handling against StyleX's
 * property-priorities source of truth in `@stylexjs/shared`.
 *
 * If StyleX adds a new `shorthandsOfShorthands` entry that we haven't categorized,
 * this test will fail — forcing us to decide whether to handle it or add it to the skip list.
 */
import { describe, expect, it } from "vitest";
import { createRequire } from "node:module";
import fs from "node:fs";
import { STYLEX_LONGHAND_ONLY_SHORTHANDS } from "./stylex-shorthands.js";
import { SHORTHAND_LONGHANDS } from "./emit-styles.js";
import { UNSUPPORTED_SHORTHANDS_FOR_TEMPLATE_EXPR } from "./builtin-handlers/css-parsing.js";

// --- Helpers to parse StyleX property-priorities source ---

function readPropertyPrioritiesSource(): string {
  const require = createRequire(import.meta.url);
  const babelPluginPath = require.resolve("@stylexjs/babel-plugin");
  const sharedRequire = createRequire(babelPluginPath);
  const prioritiesPath = sharedRequire.resolve("@stylexjs/shared/lib/utils/property-priorities");
  return fs.readFileSync(prioritiesPath, "utf-8");
}

function extractSetEntries(source: string, setName: string): Set<string> {
  const entries = new Set<string>();
  const regex = new RegExp(`${setName}\\.add\\('([^']+)'\\)`, "g");
  let match;
  while ((match = regex.exec(source)) !== null) {
    entries.add(match[1]!);
  }
  return entries;
}

// --- Parse StyleX property-priorities ---

const source = readPropertyPrioritiesSource();
const stylexShorthandsOfShorthands = extractSetEntries(source, "shorthandsOfShorthands");
const stylexShorthandsOfLonghands = extractSetEntries(source, "shorthandsOfLonghands");
const stylexLongHandPhysical = extractSetEntries(source, "longHandPhysical");

/**
 * Shorthands of shorthands that we intentionally do NOT expand.
 * These are either:
 * - Too complex to safely expand in a codemod (animation, font, grid)
 * - Not commonly used in styled-components (all, inset)
 * - Handled by different mechanisms (border-block, border-inline)
 */
const NOT_APPLICABLE_SHORTHANDS = new Set([
  "all",
  "animation",
  "border-block",
  "border-inline",
  "font",
  "grid",
  "grid-area",
  "grid-template",
  "inset",
]);

// --- Tests ---

describe("StyleX property-priorities cross-reference", () => {
  it("should have all shorthandsOfShorthands categorized", () => {
    const uncategorized: string[] = [];
    for (const prop of stylexShorthandsOfShorthands) {
      const inOurs = STYLEX_LONGHAND_ONLY_SHORTHANDS.has(prop);
      const inSkip = NOT_APPLICABLE_SHORTHANDS.has(prop);
      if (!inOurs && !inSkip) {
        uncategorized.push(prop);
      }
    }
    expect(
      uncategorized,
      `Uncategorized shorthandsOfShorthands from StyleX. Add them to STYLEX_LONGHAND_ONLY_SHORTHANDS ` +
        `(if the codemod should expand them) or NOT_APPLICABLE_SHORTHANDS (if not): ${uncategorized.join(", ")}`,
    ).toEqual([]);
  });

  it("should not have entries in STYLEX_LONGHAND_ONLY_SHORTHANDS that StyleX doesn't classify as shorthandsOfShorthands", () => {
    const extras: string[] = [];
    for (const prop of STYLEX_LONGHAND_ONLY_SHORTHANDS) {
      // border-top, border-right, border-bottom, border-left are classified as
      // shorthandsOfLonghands in StyleX (they expand to width/style/color), but we
      // treat them as longhand-only shorthands for our codemod's expansion purposes.
      const isDirectionalBorder = /^border-(top|right|bottom|left)$/.test(prop);
      if (
        !stylexShorthandsOfShorthands.has(prop) &&
        !stylexShorthandsOfLonghands.has(prop) &&
        !isDirectionalBorder
      ) {
        extras.push(prop);
      }
    }
    expect(
      extras,
      `STYLEX_LONGHAND_ONLY_SHORTHANDS contains properties not in StyleX's shorthand sets: ${extras.join(", ")}`,
    ).toEqual([]);
  });

  it("should have correct physical longhands in SHORTHAND_LONGHANDS", () => {
    for (const [shorthand, { physical }] of Object.entries(SHORTHAND_LONGHANDS)) {
      const cssProp = shorthand.replace(/[A-Z]/g, (ch) => `-${ch.toLowerCase()}`);
      for (const physicalProp of physical) {
        const cssPhysical = physicalProp.replace(/[A-Z]/g, (ch) => `-${ch.toLowerCase()}`);
        expect(
          stylexLongHandPhysical.has(cssPhysical),
          `${cssPhysical} (from SHORTHAND_LONGHANDS.${shorthand}.physical) should be in StyleX's longHandPhysical set. ` +
            `CSS prop: ${cssProp}`,
        ).toBe(true);
      }
    }
  });

  it("should have correct logical longhands in SHORTHAND_LONGHANDS", () => {
    for (const [shorthand, { logical }] of Object.entries(SHORTHAND_LONGHANDS)) {
      for (const logicalProp of logical) {
        const cssLogical = logicalProp.replace(/[A-Z]/g, (ch) => `-${ch.toLowerCase()}`);
        expect(
          stylexShorthandsOfLonghands.has(cssLogical),
          `${cssLogical} (from SHORTHAND_LONGHANDS.${shorthand}.logical) should be in StyleX's shorthandsOfLonghands set`,
        ).toBe(true);
      }
    }
  });

  it("should have UNSUPPORTED_SHORTHANDS_FOR_TEMPLATE_EXPR as a subset of STYLEX_LONGHAND_ONLY_SHORTHANDS", () => {
    const notInLonghandOnly: string[] = [];
    for (const prop of UNSUPPORTED_SHORTHANDS_FOR_TEMPLATE_EXPR) {
      if (!STYLEX_LONGHAND_ONLY_SHORTHANDS.has(prop)) {
        notInLonghandOnly.push(prop);
      }
    }
    expect(
      notInLonghandOnly,
      `UNSUPPORTED_SHORTHANDS_FOR_TEMPLATE_EXPR contains properties not in STYLEX_LONGHAND_ONLY_SHORTHANDS: ` +
        `${notInLonghandOnly.join(", ")}. Every shorthand we bail on for template expressions should also be ` +
        `in the longhand-only set.`,
    ).toEqual([]);
  });

  it("should have SHORTHAND_LONGHANDS entries that are in STYLEX_LONGHAND_ONLY_SHORTHANDS or StyleX shorthandsOfShorthands", () => {
    for (const shorthand of Object.keys(SHORTHAND_LONGHANDS)) {
      const cssProp = shorthand.replace(/[A-Z]/g, (ch) => `-${ch.toLowerCase()}`);
      const inLonghandOnly = STYLEX_LONGHAND_ONLY_SHORTHANDS.has(cssProp);
      const inStylexShorthands = stylexShorthandsOfShorthands.has(cssProp);
      expect(
        inLonghandOnly || inStylexShorthands,
        `SHORTHAND_LONGHANDS key "${shorthand}" (CSS: ${cssProp}) should be in ` +
          `STYLEX_LONGHAND_ONLY_SHORTHANDS or StyleX's shorthandsOfShorthands`,
      ).toBe(true);
    }
  });
});

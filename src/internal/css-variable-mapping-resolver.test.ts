import { describe, expect, it } from "vitest";
import {
  resolveCssVariableFromMapping,
  CSS_VARIABLE_MAPPING_NO_MATCH,
} from "./css-variable-mapping-resolver.js";
import type { CssVariableMapping } from "../adapter.js";

describe("resolveCssVariableFromMapping", () => {
  // ── Exact match ──────────────────────────────────────────────────────

  it("matches exact variable name", () => {
    const mapping: CssVariableMapping = [
      ["--base-size", { expr: "calcVars.baseSize", imports: [] }],
    ];
    const result = resolveCssVariableFromMapping(mapping, { name: "--base-size" });
    expect(result).toEqual({ expr: "calcVars.baseSize", imports: [] });
  });

  it("does not match different variable name", () => {
    const mapping: CssVariableMapping = [
      ["--base-size", { expr: "calcVars.baseSize", imports: [] }],
    ];
    expect(resolveCssVariableFromMapping(mapping, { name: "--other" })).toBe(
      CSS_VARIABLE_MAPPING_NO_MATCH,
    );
  });

  // ── Prefix match ─────────────────────────────────────────────────────

  it("matches prefix pattern with --color-*", () => {
    const mapping: CssVariableMapping = [["--color-*", { expr: "vars.{name}", imports: [] }]];
    const result = resolveCssVariableFromMapping(mapping, { name: "--color-primary" });
    expect(result).toEqual({ expr: "vars.primary", imports: [] });
  });

  it("does not match prefix pattern against unrelated variable", () => {
    const mapping: CssVariableMapping = [["--color-*", { expr: "vars.{name}", imports: [] }]];
    expect(resolveCssVariableFromMapping(mapping, { name: "--spacing-lg" })).toBe(
      CSS_VARIABLE_MAPPING_NO_MATCH,
    );
  });

  // ── Wildcard match ───────────────────────────────────────────────────

  it("matches catch-all wildcard", () => {
    const mapping: CssVariableMapping = [["*", { expr: "vars.{name}", imports: [] }]];
    const result = resolveCssVariableFromMapping(mapping, { name: "--border-radius" });
    expect(result).toEqual({ expr: "vars.borderRadius", imports: [] });
  });

  // ── Placeholder interpolation ────────────────────────────────────────

  it("interpolates {name} as camelCase", () => {
    const mapping: CssVariableMapping = [["*", { expr: "tokens.{name}", imports: [] }]];
    const result = resolveCssVariableFromMapping(mapping, { name: "--font-weight-medium" });
    expect(result).toEqual({ expr: "tokens.fontWeightMedium", imports: [] });
  });

  it("interpolates {raw} as original variable name", () => {
    const mapping: CssVariableMapping = [["*", { expr: 'vars["{raw}"]', imports: [] }]];
    const result = resolveCssVariableFromMapping(mapping, { name: "--my-var" });
    expect(result).toEqual({ expr: 'vars["--my-var"]', imports: [] });
  });

  // ── dropDefinition ───────────────────────────────────────────────────

  it("includes dropDefinition when set to true", () => {
    const mapping: CssVariableMapping = [
      ["--base-size", { expr: "calcVars.baseSize", imports: [], dropDefinition: true }],
    ];
    const result = resolveCssVariableFromMapping(mapping, {
      name: "--base-size",
      definedValue: "16px",
    });
    expect(result).toEqual({ expr: "calcVars.baseSize", imports: [], dropDefinition: true });
  });

  it("includes dropDefinition when string matches definedValue", () => {
    const mapping: CssVariableMapping = [
      ["--base-size", { expr: "calcVars.baseSize", imports: [], dropDefinition: "16px" }],
    ];
    const result = resolveCssVariableFromMapping(mapping, {
      name: "--base-size",
      definedValue: "16px",
    });
    expect(result).toEqual({ expr: "calcVars.baseSize", imports: [], dropDefinition: true });
  });

  it("omits dropDefinition when string does not match definedValue", () => {
    const mapping: CssVariableMapping = [
      ["--base-size", { expr: "calcVars.baseSize", imports: [], dropDefinition: "16px" }],
    ];
    const result = resolveCssVariableFromMapping(mapping, {
      name: "--base-size",
      definedValue: "24px",
    });
    expect(result).toEqual({ expr: "calcVars.baseSize", imports: [] });
  });

  // ── First match wins ─────────────────────────────────────────────────

  it("returns first matching entry", () => {
    const mapping: CssVariableMapping = [
      ["--color-primary", { expr: "FIRST", imports: [] }],
      ["--color-*", { expr: "SECOND", imports: [] }],
    ];
    const result = resolveCssVariableFromMapping(mapping, { name: "--color-primary" });
    expect(result).toEqual({ expr: "FIRST", imports: [] });
  });

  // ── No match ─────────────────────────────────────────────────────────

  it("returns CSS_VARIABLE_MAPPING_NO_MATCH for empty mapping", () => {
    expect(resolveCssVariableFromMapping([], { name: "--x" })).toBe(CSS_VARIABLE_MAPPING_NO_MATCH);
  });

  it("returns CSS_VARIABLE_MAPPING_NO_MATCH when nothing matches", () => {
    const mapping: CssVariableMapping = [
      ["--color-primary", { expr: "vars.primary", imports: [] }],
    ];
    expect(resolveCssVariableFromMapping(mapping, { name: "--spacing-lg" })).toBe(
      CSS_VARIABLE_MAPPING_NO_MATCH,
    );
  });
});

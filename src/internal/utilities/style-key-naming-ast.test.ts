import { describe, it, expect } from "vitest";
import jscodeshift from "jscodeshift";
import { extractConditionName } from "./style-key-naming";

const j = jscodeshift.withParser("tsx");

type ExpressionKind = Parameters<typeof j.expressionStatement>[0];

function parseExpr(code: string): ExpressionKind {
  const ast = j(`const x = ${code}`);
  const decl = ast.find(j.VariableDeclarator).nodes()[0];
  if (!decl?.init) {
    throw new Error("Failed to parse expression");
  }
  return decl.init as ExpressionKind;
}

describe("extractConditionName", () => {
  describe("simple identifiers", () => {
    it("extracts simple identifier", () => {
      const expr = parseExpr("isMobile");
      expect(extractConditionName(expr)).toBe("IsMobile");
    });

    it("extracts identifier starting with lowercase", () => {
      const expr = parseExpr("isLargeScreen");
      expect(extractConditionName(expr)).toBe("IsLargeScreen");
    });

    it("extracts identifier starting with uppercase", () => {
      const expr = parseExpr("Active");
      expect(extractConditionName(expr)).toBe("Active");
    });
  });

  describe("member expressions", () => {
    it("extracts single-level member expression", () => {
      const expr = parseExpr("Browser.isSafari");
      expect(extractConditionName(expr)).toBe("BrowserIsSafari");
    });

    it("extracts nested member expression", () => {
      const expr = parseExpr("Platform.browser.isChrome");
      expect(extractConditionName(expr)).toBe("PlatformBrowserIsChrome");
    });

    it("extracts deeply nested member expression", () => {
      const expr = parseExpr("env.platform.browser.webkit");
      expect(extractConditionName(expr)).toBe("EnvPlatformBrowserWebkit");
    });
  });

  describe("unary not expressions", () => {
    it("extracts negated identifier", () => {
      const expr = parseExpr("!isMobile");
      expect(extractConditionName(expr)).toBe("NotIsMobile");
    });

    it("extracts negated member expression", () => {
      const expr = parseExpr("!Browser.isSafari");
      expect(extractConditionName(expr)).toBe("NotBrowserIsSafari");
    });

    it("returns null for negated complex expression", () => {
      const expr = parseExpr("!(a > b)");
      expect(extractConditionName(expr)).toBeNull();
    });
  });

  describe("logical expressions", () => {
    it("extracts logical OR with identifiers", () => {
      const expr = parseExpr("isMobile || isTablet");
      expect(extractConditionName(expr)).toBe("IsMobileOrIsTablet");
    });

    it("extracts logical OR with member expressions", () => {
      const expr = parseExpr("Browser.isSafari || Browser.isFirefox");
      expect(extractConditionName(expr)).toBe("BrowserIsSafariOrBrowserIsFirefox");
    });

    it("extracts logical AND with identifiers", () => {
      const expr = parseExpr("isMobile && isPortrait");
      expect(extractConditionName(expr)).toBe("IsMobileAndIsPortrait");
    });

    it("returns null for mixed AND with complex expression", () => {
      const expr = parseExpr("42 && isSomething");
      expect(extractConditionName(expr)).toBeNull();
    });
  });

  describe("call expressions", () => {
    it("extracts call with no arguments", () => {
      const expr = parseExpr("isMobile()");
      expect(extractConditionName(expr)).toBe("IsMobile");
    });

    it("extracts member call with no arguments", () => {
      const expr = parseExpr("Browser.isSafari()");
      expect(extractConditionName(expr)).toBe("BrowserIsSafari");
    });

    it("returns null for call with arguments", () => {
      const expr = parseExpr("checkPlatform('ios')");
      expect(extractConditionName(expr)).toBeNull();
    });
  });

  describe("complex expressions - returns null", () => {
    it("returns null for comparison", () => {
      const expr = parseExpr("width > 768");
      expect(extractConditionName(expr)).toBeNull();
    });

    it("returns null for ternary expression", () => {
      const expr = parseExpr("a ? b : c");
      expect(extractConditionName(expr)).toBeNull();
    });

    it("returns null for computed member expression", () => {
      const expr = parseExpr("obj[key]");
      expect(extractConditionName(expr)).toBeNull();
    });
  });
});

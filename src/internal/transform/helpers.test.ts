import { describe, it, expect } from "vitest";
import { toSuffixFromProp } from "./helpers";

describe("toSuffixFromProp", () => {
  describe("simple prop names", () => {
    it("capitalizes simple prop name", () => {
      expect(toSuffixFromProp("primary")).toBe("Primary");
    });

    it("strips $ prefix and capitalizes", () => {
      expect(toSuffixFromProp("$isActive")).toBe("Active");
    });

    it("handles isX convention", () => {
      expect(toSuffixFromProp("isActive")).toBe("Active");
    });
  });

  describe("dotted paths", () => {
    it("converts dotted path to PascalCase", () => {
      expect(toSuffixFromProp("config.enabled")).toBe("ConfigEnabled");
    });

    it("converts deeply nested dotted path", () => {
      expect(toSuffixFromProp("user.settings.darkMode")).toBe("UserSettingsDarkMode");
    });
  });

  describe("comparison expressions", () => {
    it("handles === comparison", () => {
      expect(toSuffixFromProp('size === "large"')).toBe("SizeLarge");
    });

    it("handles !== comparison", () => {
      expect(toSuffixFromProp('variant !== "primary"')).toBe("VariantNotPrimary");
    });

    it("handles dotted path in comparison", () => {
      expect(toSuffixFromProp('user.role === "admin"')).toBe("UserRoleAdmin");
    });

    it("deduplicates consecutive repeated words", () => {
      // user.role === Role.admin => UserRole + RoleAdmin => UserRoleAdmin (not UserRoleRoleAdmin)
      expect(toSuffixFromProp("user.role === Role.admin")).toBe("UserRoleAdmin");
    });

    it("deduplicates status.status pattern", () => {
      // status === Status.active => Status + StatusActive => StatusActive (not StatusStatusActive)
      expect(toSuffixFromProp("status === Status.active")).toBe("StatusActive");
    });
  });

  describe("compound expressions", () => {
    it("handles && compound", () => {
      expect(toSuffixFromProp("disabled && selected")).toBe("DisabledSelected");
    });

    it("handles || compound", () => {
      expect(toSuffixFromProp("isMobile || isTablet")).toBe("MobileOrTablet");
    });

    it("handles negation", () => {
      expect(toSuffixFromProp("!isActive")).toBe("NotActive");
    });
  });

  describe("CSS variables", () => {
    it("handles CSS variable names", () => {
      expect(toSuffixFromProp("--component-width")).toBe("ComponentWidth");
    });
  });
});

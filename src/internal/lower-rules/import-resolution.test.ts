import { describe, it, expect } from "vitest";
import jscodeshift from "jscodeshift";
import { buildSafeIndexedParamName, createImportResolver } from "./import-resolution.js";

const j = jscodeshift.withParser("tsx");

describe("buildSafeIndexedParamName", () => {
  it("returns preferred name for valid identifiers", () => {
    expect(buildSafeIndexedParamName("color", null)).toBe("color");
  });

  it("returns 'propValue' for invalid identifier names", () => {
    expect(buildSafeIndexedParamName("123invalid", null)).toBe("propValue");
    expect(buildSafeIndexedParamName("prop-value", null)).toBe("propValue");
    expect(buildSafeIndexedParamName("a b", null)).toBe("propValue");
  });

  it("appends 'Value' when preferred matches container expression name", () => {
    const containerExpr = { type: "Identifier", name: "color" } as any;
    expect(buildSafeIndexedParamName("color", containerExpr)).toBe("colorValue");
  });

  it("returns preferred name when container is not an identifier", () => {
    const containerExpr = { type: "MemberExpression" } as any;
    expect(buildSafeIndexedParamName("color", containerExpr)).toBe("color");
  });

  it("returns preferred name when container name differs", () => {
    const containerExpr = { type: "Identifier", name: "bg" } as any;
    expect(buildSafeIndexedParamName("color", containerExpr)).toBe("color");
  });

  it("accepts dollar-prefixed names", () => {
    expect(buildSafeIndexedParamName("$active", null)).toBe("$active");
  });

  it("accepts underscore-prefixed names", () => {
    expect(buildSafeIndexedParamName("_private", null)).toBe("_private");
  });
});

describe("createImportResolver", () => {
  function createResolver(
    code: string,
    importEntries: [
      string,
      { importedName: string; source: { kind: "specifier" | "absolutePath"; value: string } },
    ][],
  ) {
    const root = j(code);
    const importMap = new Map(importEntries);
    return createImportResolver({ root, j, importMap });
  }

  describe("resolveImportInScope", () => {
    it("resolves a top-level import", () => {
      const code = `import { color } from "tokens";\nconst x = color;`;
      const { resolveImportInScope } = createResolver(code, [
        ["color", { importedName: "color", source: { kind: "specifier", value: "tokens" } }],
      ]);
      const result = resolveImportInScope("color");
      expect(result).toEqual({
        importedName: "color",
        source: { kind: "specifier", value: "tokens" },
      });
    });

    it("returns null for unknown import names", () => {
      const code = `const x = 1;`;
      const { resolveImportInScope } = createResolver(code, []);
      const result = resolveImportInScope("unknown");
      expect(result).toBeNull();
    });

    it("detects shadowing by function parameter", () => {
      const code = `import { color } from "tokens";\nfunction foo(color: string) { return color; }`;
      const root = j(code);
      const importMap = new Map([
        [
          "color",
          { importedName: "color", source: { kind: "specifier" as const, value: "tokens" } },
        ],
      ]);
      const { resolveImportInScope } = createImportResolver({ root, j, importMap });

      const fnBody = root.find(j.FunctionDeclaration).get();
      const colorInFn = j(fnBody)
        .find(j.ReturnStatement)
        .find(j.Identifier, { name: "color" })
        .get().node;

      const result = resolveImportInScope("color", colorInFn);
      expect(result).toBeNull();
    });

    it("detects shadowing by let/const in block", () => {
      const code = `import { val } from "tokens";\n{ const val = 5; console.log(val); }`;
      const root = j(code);
      const importMap = new Map([
        ["val", { importedName: "val", source: { kind: "specifier" as const, value: "tokens" } }],
      ]);
      const { resolveImportInScope } = createImportResolver({ root, j, importMap });

      const blockIdents = j(root.find(j.BlockStatement).get())
        .find(j.Identifier, { name: "val" })
        .paths();

      const consoleLogArg = blockIdents.find((p: any) => {
        const parent = p.parentPath?.node;
        return parent?.type === "CallExpression";
      });

      if (consoleLogArg) {
        const result = resolveImportInScope("val", consoleLogArg.node);
        expect(result).toBeNull();
      }
    });

    it("does not detect shadowing for top-level identifier", () => {
      const code = `import { color } from "tokens";\nconst x = color;`;
      const root = j(code);
      const importMap = new Map([
        [
          "color",
          { importedName: "color", source: { kind: "specifier" as const, value: "tokens" } },
        ],
      ]);
      const { resolveImportInScope } = createImportResolver({ root, j, importMap });

      const topColorIdent = root
        .find(j.VariableDeclarator, { id: { name: "x" } })
        .find(j.Identifier, { name: "color" })
        .get().node;

      const result = resolveImportInScope("color", topColorIdent);
      expect(result).not.toBeNull();
    });
  });

  describe("resolveImportForExpr", () => {
    it("resolves call expression with imported callee", () => {
      const code = `import { helper } from "tokens";\nconst x = helper("test");`;
      const root = j(code);
      const importMap = new Map([
        [
          "helper",
          { importedName: "helper", source: { kind: "specifier" as const, value: "tokens" } },
        ],
      ]);
      const { resolveImportForExpr } = createImportResolver({ root, j, importMap });

      const callExpr = root.find(j.CallExpression).get().node;
      const result = resolveImportForExpr(callExpr, "helper");
      expect(result).not.toBeNull();
      expect(result!.importedName).toBe("helper");
    });

    it("resolves curried call expression", () => {
      const code = `import { helper } from "tokens";\nconst x = helper("test")("arg");`;
      const root = j(code);
      const importMap = new Map([
        [
          "helper",
          { importedName: "helper", source: { kind: "specifier" as const, value: "tokens" } },
        ],
      ]);
      const { resolveImportForExpr } = createImportResolver({ root, j, importMap });

      const outerCall = root.find(j.VariableDeclarator).get().node.init;
      const result = resolveImportForExpr(outerCall, "helper");
      expect(result).not.toBeNull();
    });

    it("returns null for non-matching callee", () => {
      const code = `import { helper } from "tokens";\nconst x = other("test");`;
      const root = j(code);
      const importMap = new Map([
        [
          "helper",
          { importedName: "helper", source: { kind: "specifier" as const, value: "tokens" } },
        ],
      ]);
      const { resolveImportForExpr } = createImportResolver({ root, j, importMap });

      const callExpr = root.find(j.CallExpression).get().node;
      const result = resolveImportForExpr(callExpr, "helper");
      expect(result).toBeNull();
    });

    it("returns null for non-call expression", () => {
      const code = `const x = 1;`;
      const root = j(code);
      const { resolveImportForExpr } = createImportResolver({ root, j, importMap: new Map() });

      const result = resolveImportForExpr({ type: "Identifier", name: "x" }, "x");
      expect(result).toBeNull();
    });
  });
});

import { describe, expect, it } from "vitest";
import { PARTIAL_MIGRATION_INCOMPLETE_WARNING } from "../logger.js";
import type { TransformContext } from "../transform-context.js";
import type { StyledDecl, TransformOptions } from "../transform-types.js";
import { warnPartialMigrationIncompleteStep } from "./warn-partial-migration-incomplete.js";

describe("warnPartialMigrationIncompleteStep", () => {
  it("counts direct JSX resolutions as converted declarations", () => {
    const ctx = createContext({
      styledDecls: [
        createStyledDecl("SyntheticFlex", { isDirectJsxResolution: true }),
        createStyledDecl("LegacyButton", {
          skipTransform: true,
          loc: { line: 4, column: 2 },
        }),
      ],
    });

    warnPartialMigrationIncompleteStep(ctx);

    expect(ctx.warnings).toContainEqual(
      expect.objectContaining({
        severity: "warning",
        type: PARTIAL_MIGRATION_INCOMPLETE_WARNING,
        loc: { line: 4, column: 2 },
        context: expect.objectContaining({
          skippedDeclarationCount: 1,
          skippedDeclarations: ["LegacyButton"],
          convertedDeclarationCount: 1,
          convertedDeclarations: ["SyntheticFlex"],
        }),
      }),
    );
  });
});

function createContext({
  hasChanges = true,
  options = { allowPartialMigration: true },
  styledDecls,
}: {
  hasChanges?: boolean;
  options?: Partial<TransformOptions>;
  styledDecls: StyledDecl[];
}): TransformContext {
  return {
    hasChanges,
    options,
    styledDecls,
    warnings: [],
  } as unknown as TransformContext;
}

function createStyledDecl(localName: string, overrides: Partial<StyledDecl> = {}): StyledDecl {
  return {
    localName,
    base: { kind: "intrinsic", tagName: "div" },
    styleKey: localName.charAt(0).toLowerCase() + localName.slice(1),
    rules: [],
    templateExpressions: [],
    ...overrides,
  };
}

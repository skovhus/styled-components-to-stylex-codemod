import { describe, expect, it } from "vitest";
import jscodeshift from "jscodeshift";
import { cleanupEmptyStyleReferences } from "./post-process-empty-style-references.js";
import { postProcessTransformedAst } from "./rewrite-jsx.js";

const j = jscodeshift.withParser("tsx");

function sourceAfterPostProcess(source: string): string {
  const root = j(source);
  const result = postProcessTransformedAst({
    root,
    j,
    relationOverrides: [
      {
        parentStyleKey: "parentKey",
        childStyleKey: "childKey",
        overrideStyleKey: "childInParent",
      },
    ],
    ancestorSelectorParents: new Set(["parentKey"]),
    parentsNeedingDefaultMarker: new Set(["parentKey"]),
  });
  expect(result.changed).toBe(false);
  return root.toSource();
}

describe("cleanupEmptyStyleReferences", () => {
  it("preserves optional stylex props calls and optional style refs", () => {
    const root = j(`
      const value = (
        <div
          {...stylex?.props(styles.emptyKey)}
          sx={[styles?.emptyKey, styles.emptyKey, userSx]}
        />
      );
    `);

    const changed = cleanupEmptyStyleReferences({
      root,
      j,
      emptyStyleKeys: new Set(["emptyKey"]),
      stylesIdentifier: "styles",
    });

    expect(changed).toBe(true);
    const output = root.toSource();
    expect(output).toContain("{...stylex?.props(styles.emptyKey)}");
    expect(output).toContain("styles?.emptyKey");
    expect(output).toContain("userSx");
    expect(output).not.toContain("styles.emptyKey, userSx");
  });
});

describe("postProcessTransformedAst", () => {
  it("does not use optional sx style refs as relation markers", () => {
    const output = sourceAfterPostProcess(`
      const value = (
        <div sx={styles?.parentKey}>
          <span {...stylex.props(styles.childKey)} />
        </div>
      );
    `);

    expect(output).toContain("sx={styles?.parentKey}");
    expect(output).toContain("stylex.props(styles.childKey)");
    expect(output).not.toContain("defaultMarker");
    expect(output).not.toContain("childInParent");
  });
});

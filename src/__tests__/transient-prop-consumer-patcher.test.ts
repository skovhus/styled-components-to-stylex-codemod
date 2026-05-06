import { describe, expect, it } from "vitest";
import {
  findImportedRenamedComponents,
  patchSourceTransientProps,
} from "../internal/transient-prop-consumer-patcher.js";

describe("findImportedRenamedComponents", () => {
  const renames = [{ exportName: "Toggle", renames: { $active: "active" } }];
  const sources = new Set(["./Toggle", "./Toggle.tsx"]);

  it("finds named import", () => {
    const source = `import { Toggle } from "./Toggle";\n<Toggle $active />`;
    const result = findImportedRenamedComponents(source, sources, renames);
    expect(result).toEqual([{ localComponentName: "Toggle", renames: { $active: "active" } }]);
  });

  it("finds aliased named import", () => {
    const source = `import { Toggle as MyToggle } from "./Toggle";\n<MyToggle $active />`;
    const result = findImportedRenamedComponents(source, sources, renames);
    expect(result).toEqual([{ localComponentName: "MyToggle", renames: { $active: "active" } }]);
  });

  it("finds default import", () => {
    const defaultRenames = [{ exportName: "default", renames: { $open: "open" } }];
    const source = `import Toggle from "./Toggle";\n<Toggle $open />`;
    const result = findImportedRenamedComponents(source, sources, defaultRenames);
    expect(result).toEqual([{ localComponentName: "Toggle", renames: { $open: "open" } }]);
  });

  it("finds dotted namespace member imports", () => {
    const memberRenames = [{ exportName: "Section.Container", renames: { $asCard: "asCard" } }];
    const source = `import { Section as OverviewSection } from "./Toggle";\n<OverviewSection.Container $asCard />`;
    const result = findImportedRenamedComponents(source, sources, memberRenames);
    expect(result).toEqual([
      { localComponentName: "OverviewSection.Container", renames: { $asCard: "asCard" } },
    ]);
  });

  it("finds styled wrappers around dotted member imports", () => {
    const memberRenames = [{ exportName: "Section.Container", renames: { $asCard: "asCard" } }];
    const source = [
      `import { Section } from "./Toggle";`,
      `const LocalContainer = styled(Section.Container)\`margin: 0;\`;`,
      `<LocalContainer $asCard />`,
    ].join("\n");
    const result = findImportedRenamedComponents(source, sources, memberRenames);
    expect(result).toEqual([
      { localComponentName: "Section.Container", renames: { $asCard: "asCard" } },
      { localComponentName: "LocalContainer", renames: { $asCard: "asCard" } },
    ]);
  });

  it("returns empty for non-matching import source", () => {
    const source = `import { Toggle } from "./other-file";\n<Toggle $active />`;
    const result = findImportedRenamedComponents(source, sources, renames);
    expect(result).toEqual([]);
  });

  it("returns empty for type-only import", () => {
    const source = `import type { Toggle } from "./Toggle";\n<Toggle $active />`;
    const result = findImportedRenamedComponents(source, sources, renames);
    expect(result).toEqual([]);
  });
});

describe("patchSourceTransientProps", () => {
  it("renames $-prefixed JSX attributes", () => {
    const source = `import { Toggle } from "./Toggle";\n\nexport const App = () => <Toggle $active $size="large" />;`;
    const result = patchSourceTransientProps(source, [
      { localComponentName: "Toggle", renames: { $active: "active", $size: "size" } },
    ]);
    expect(result).not.toBeNull();
    expect(result).toContain("active");
    expect(result).toContain('size="large"');
    expect(result).not.toContain("$active");
    expect(result).not.toContain("$size");
  });

  it("handles shorthand boolean props", () => {
    const result = patchSourceTransientProps(`<Toggle $active>On</Toggle>`, [
      { localComponentName: "Toggle", renames: { $active: "active" } },
    ]);
    expect(result).not.toBeNull();
    expect(result).toContain("<Toggle active>");
  });

  it("returns null when no changes needed", () => {
    const result = patchSourceTransientProps(`<Toggle active>On</Toggle>`, [
      { localComponentName: "Toggle", renames: { $active: "active" } },
    ]);
    expect(result).toBeNull();
  });

  it("does not touch unrelated components", () => {
    const result = patchSourceTransientProps(`<OtherComp $active>On</OtherComp>`, [
      { localComponentName: "Toggle", renames: { $active: "active" } },
    ]);
    expect(result).toBeNull();
  });

  it("handles multiple components from different targets", () => {
    const source = `<Toggle $active />\n<Badge $variant="ok" />`;
    const result = patchSourceTransientProps(source, [
      { localComponentName: "Toggle", renames: { $active: "active" } },
      { localComponentName: "Badge", renames: { $variant: "variant" } },
    ]);
    expect(result).not.toBeNull();
    expect(result).toContain("<Toggle active");
    expect(result).toContain('variant="ok"');
    expect(result).not.toContain("$active");
    expect(result).not.toContain("$variant");
  });

  it("renames props on JSX member expression tags", () => {
    const result = patchSourceTransientProps(
      `<Section.Container $asCard={collapsed} />\n<Graph.Legend.Grid $columnCount={3} $dense />`,
      [
        { localComponentName: "Section.Container", renames: { $asCard: "asCard" } },
        {
          localComponentName: "Graph.Legend.Grid",
          renames: { $columnCount: "columnCount", $dense: "dense" },
        },
      ],
    );
    expect(result).not.toBeNull();
    expect(result).toContain("<Section.Container asCard={collapsed}");
    expect(result).toContain("<Graph.Legend.Grid columnCount={3} dense");
    expect(result).not.toContain("$asCard");
    expect(result).not.toContain("$columnCount");
    expect(result).not.toContain("$dense");
  });
});

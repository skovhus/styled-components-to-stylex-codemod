import { describe, expect, it } from "vitest";
import {
  findImportedRenamedComponents,
  patchConsumerTransientProps,
  patchSourceTransientProps,
} from "../internal/transient-prop-consumer-patcher.js";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

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
});

describe("patchConsumerTransientProps (file-based)", () => {
  let tmpDir: string;

  function writeTemp(content: string): string {
    tmpDir = mkdtempSync(join(tmpdir(), "test-patcher-"));
    const filePath = join(tmpDir, "consumer.tsx");
    writeFileSync(filePath, content, "utf-8");
    return filePath;
  }

  function cleanup(): void {
    if (tmpDir) {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  }

  it("reads file and patches it", () => {
    const filePath = writeTemp(`<Toggle $active>On</Toggle>`);
    try {
      const result = patchConsumerTransientProps(filePath, [
        { localComponentName: "Toggle", renames: { $active: "active" } },
      ]);
      expect(result).not.toBeNull();
      expect(result).toContain("<Toggle active>");
    } finally {
      cleanup();
    }
  });

  it("returns null for missing file", () => {
    const result = patchConsumerTransientProps("/nonexistent/path.tsx", [
      { localComponentName: "Toggle", renames: { $active: "active" } },
    ]);
    expect(result).toBeNull();
  });
});

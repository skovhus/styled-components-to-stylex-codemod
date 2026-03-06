import { describe, expect, it } from "vitest";
import {
  findImportedRenamedComponents,
  patchConsumerTransientProps,
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

describe("patchConsumerTransientProps", () => {
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

  it("renames $-prefixed JSX attributes", () => {
    const filePath = writeTemp(
      `import { Toggle } from "./Toggle";\n\nexport const App = () => <Toggle $active $size="large" />;`,
    );
    try {
      const result = patchConsumerTransientProps(filePath, [
        { localComponentName: "Toggle", renames: { $active: "active", $size: "size" } },
      ]);
      expect(result).not.toBeNull();
      expect(result).toContain("active");
      expect(result).toContain('size="large"');
      expect(result).not.toContain("$active");
      expect(result).not.toContain("$size");
    } finally {
      cleanup();
    }
  });

  it("handles shorthand boolean props", () => {
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

  it("returns null when no changes needed", () => {
    const filePath = writeTemp(`<Toggle active>On</Toggle>`);
    try {
      const result = patchConsumerTransientProps(filePath, [
        { localComponentName: "Toggle", renames: { $active: "active" } },
      ]);
      expect(result).toBeNull();
    } finally {
      cleanup();
    }
  });

  it("does not touch unrelated components", () => {
    const filePath = writeTemp(`<OtherComp $active>On</OtherComp>`);
    try {
      const result = patchConsumerTransientProps(filePath, [
        { localComponentName: "Toggle", renames: { $active: "active" } },
      ]);
      expect(result).toBeNull();
    } finally {
      cleanup();
    }
  });
});

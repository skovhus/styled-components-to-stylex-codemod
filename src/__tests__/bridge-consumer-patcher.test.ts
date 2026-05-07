import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { patchConsumerFile } from "../internal/bridge-consumer-patcher.js";

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "bridge-consumer-patcher-"));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

function writeConsumer(source: string): string {
  const filePath = join(dir, "consumer.tsx");
  writeFileSync(filePath, source, "utf8");
  return filePath;
}

describe("patchConsumerFile", () => {
  it("removes the replaced component import when only the GlobalSelector remains in use", () => {
    const filePath = writeConsumer(`
import styled from "styled-components";
import { Tile } from "./Tile";

/** Children must be Tile components. */
export const Grid = styled.div\`
  /* Tile children are patched through the global selector. */
  > \${Tile} {
    width: 100%;
  }
\`;
`);

    const patched = patchConsumerFile(filePath, [
      {
        localName: "Tile",
        importSource: "./Tile",
        globalSelectorVarName: "TileGlobalSelector",
        importedName: "Tile",
      },
    ]);

    expect(patched).toContain(`import { TileGlobalSelector } from "./Tile";`);
    expect(patched).not.toContain(`import { Tile, TileGlobalSelector } from "./Tile";`);
    expect(patched).not.toContain("${Tile}");
    expect(patched).toContain("${TileGlobalSelector}");
  });

  it("keeps the component import when the component is still used as a value", () => {
    const filePath = writeConsumer(`
import styled from "styled-components";
import { Tile } from "./Tile";

export const Grid = styled.div\`
  > \${Tile} {
    width: 100%;
  }
\`;

export function App() {
  return <Tile />;
}
`);

    const patched = patchConsumerFile(filePath, [
      {
        localName: "Tile",
        importSource: "./Tile",
        globalSelectorVarName: "TileGlobalSelector",
        importedName: "Tile",
      },
    ]);

    expect(patched).toContain(`import { Tile, TileGlobalSelector } from "./Tile";`);
    expect(patched).toContain("<Tile />");
    expect(patched).toContain("${TileGlobalSelector}");
  });
});

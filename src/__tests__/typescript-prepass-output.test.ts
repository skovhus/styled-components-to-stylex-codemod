import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import jscodeshift from "jscodeshift";
import { describe, expect, it } from "vitest";

import { fixtureAdapter } from "./fixture-adapters.js";
import { analyzeTypeScriptProgram } from "../internal/prepass/typescript-analysis.js";
import { transformWithWarnings } from "../transform.js";

const j = jscodeshift.withParser("tsx");
const api = { jscodeshift: j, j, stats: () => {}, report: () => {} };

describe("TypeScript prepass output refinement", () => {
  it("does not widen closed spread-only props to className/style support", () => {
    const fixtureDir = mkdtempSync(path.join(tmpdir(), "typescript-prepass-output-"));
    const filePath = path.join(fixtureDir, "Box.tsx");
    const source = [
      'import styled from "styled-components";',
      "",
      "type BoxProps = { tone?: 'info' | 'warning' };",
      "",
      "export const Box = styled.div<BoxProps>`",
      "  color: ${(props) => props.tone === 'warning' ? 'orange' : 'blue'};",
      "`;",
      "",
      "const boxProps: BoxProps = { tone: 'info' };",
      "export const App = () => <Box {...boxProps}>Box</Box>;",
    ].join("\n");
    writeFileSync(filePath, source);

    try {
      const adapter = {
        ...fixtureAdapter,
        useSxProp: true,
        externalInterface: () => ({
          styles: true,
          as: false,
          ref: false,
          className: false,
          style: false,
          elementProps: false,
          spreadProps: true,
        }),
      };
      const before = transformWithWarnings({ source, path: filePath }, api, { adapter });
      const typeScriptMetadata = analyzeTypeScriptProgram({ files: [filePath], cwd: fixtureDir });
      const after = transformWithWarnings({ source, path: filePath }, api, {
        adapter,
        crossFileInfo: {
          selectorUsages: [],
          typeScriptMetadata,
        },
      });

      expect(before.code).toContain("className");
      expect(before.code).toContain("style,");
      expect(after.code).toContain("sx?: stylex.StyleXStyles");
      expect(after.code).toContain('Omit<React.ComponentProps<"div">, "className" | "style">');
      expect(after.code).not.toContain("className,");
      expect(after.code).not.toContain("style,");
      expect(after.code).not.toContain("mergedSx");
    } finally {
      rmSync(fixtureDir, { recursive: true, force: true });
    }
  });
});

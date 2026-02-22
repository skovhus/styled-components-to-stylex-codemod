import { describe, expect, it } from "vitest";
import { dirname, join, resolve as pathResolve } from "node:path";
import { fileURLToPath } from "node:url";

import { createModuleResolver } from "../internal/prepass/resolve-imports.js";
import { runPrepass } from "../internal/prepass/run-prepass.js";
import {
  scanCrossFileSelectors,
  type CrossFileInfo,
  type CrossFileSelectorUsage,
} from "../internal/prepass/scan-cross-file-selectors.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixturesDir = join(__dirname, "fixtures", "cross-file");
const fixture = (name: string) => pathResolve(join(fixturesDir, name));

function normalizeUsages(usages: readonly CrossFileSelectorUsage[]): CrossFileSelectorUsage[] {
  return [...usages].sort((a, b) => {
    const ka = `${a.consumerPath}:${a.localName}:${a.importedName}:${a.resolvedPath}:${a.consumerIsTransformed}`;
    const kb = `${b.consumerPath}:${b.localName}:${b.importedName}:${b.resolvedPath}:${b.consumerIsTransformed}`;
    return ka.localeCompare(kb);
  });
}

function normalizeSetMap(map: Map<string, Set<string>>): Record<string, string[]> {
  return Object.fromEntries(
    [...map.entries()]
      .map(([file, names]) => [file, [...names].sort()] as const)
      .sort(([a], [b]) => a.localeCompare(b)),
  );
}

function normalizeCrossFileInfo(info: CrossFileInfo) {
  return {
    selectorUsages: Object.fromEntries(
      [...info.selectorUsages.entries()]
        .map(([file, usages]) => [file, normalizeUsages(usages)] as const)
        .sort(([a], [b]) => a.localeCompare(b)),
    ),
    componentsNeedingMarkerSidecar: normalizeSetMap(info.componentsNeedingMarkerSidecar),
    componentsNeedingGlobalSelectorBridge: normalizeSetMap(
      info.componentsNeedingGlobalSelectorBridge,
    ),
  };
}

describe("runPrepass selector prefilter", () => {
  it("matches standalone cross-file selector scan on mixed fixture inputs", async () => {
    const files = [
      fixture("consumer-basic.tsx"),
      fixture("consumer-aliased-import.tsx"),
      fixture("consumer-interpolated-pseudo.tsx"),
      fixture("consumer-multiline-import.tsx"),
      fixture("consumer-renamed-styled.tsx"),
      fixture("consumer-two-parents.tsx"),
      fixture("consumer-value-interpolation.tsx"),
      fixture("lib/collapse-arrow-icon.tsx"),
    ];

    const resolver = createModuleResolver();

    const prepass = await runPrepass({
      filesToTransform: files,
      consumerPaths: [],
      resolver,
      parserName: "tsx",
      createExternalInterface: false,
      enableAstCache: true,
    });

    const standalone = scanCrossFileSelectors(files, [], resolver, "tsx");

    expect(normalizeCrossFileInfo(prepass.crossFileInfo)).toEqual(
      normalizeCrossFileInfo(standalone),
    );
  });
});

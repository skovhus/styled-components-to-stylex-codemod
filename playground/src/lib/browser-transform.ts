import jscodeshift from "jscodeshift";
import { parse } from "@babel/parser";
import { transformWithWarnings } from "../../../src/transform";
import type { Adapter } from "../../../src/adapter";
import type { WarningLog } from "../../../src/internal/logger";
import type { CrossFileInfo, CrossFileSelectorUsage } from "../../../src/internal/transform-types";
import {
  walkForImportsAndTemplates,
  buildImportMapFromNodes,
  findStyledImportNameFromNodes,
  findCssImportNamesFromNodes,
  findComponentSelectorLocalsFromNodes,
  BARE_TEMPLATE_IDENTIFIER_RE,
} from "../../../src/internal/prepass/scan-cross-file-selectors";
import type { AstNode } from "../../../src/internal/prepass/prepass-parser";

export type { WarningLog };

interface TransformResult {
  code: string | null;
  warnings: WarningLog[];
}

/**
 * Run the styled-components to StyleX transform in the browser.
 */
export function runTransform(
  source: string,
  adapter: Adapter,
  filename = "input.tsx",
): TransformResult {
  const j = jscodeshift.withParser("tsx");

  const file = {
    source,
    path: filename,
  };

  const api = {
    jscodeshift: j,
    j,
    stats: () => {},
    report: () => {},
  };

  const crossFileInfo = inferCrossFileInfo(source);
  const options = crossFileInfo ? { adapter, crossFileInfo } : { adapter };

  return transformWithWarnings(file, api, options);
}

/**
 * Infer cross-file selector info from source code without filesystem access.
 * Detects imported identifiers used as selectors in styled templates
 * (e.g. `${CrossFileIcon} { ... }`) and synthesizes CrossFileSelectorUsage
 * entries so the transform can handle them.
 */
function inferCrossFileInfo(source: string): CrossFileInfo | undefined {
  if (!source.includes("styled-components")) {
    return undefined;
  }
  if (!BARE_TEMPLATE_IDENTIFIER_RE.test(source)) {
    return undefined;
  }

  let ast: AstNode;
  try {
    ast = parse(source, {
      sourceType: "module",
      plugins: ["jsx", "typescript"],
    }) as unknown as AstNode;
  } catch {
    return undefined;
  }

  const program = (ast.program ?? ast) as AstNode;

  const importNodes: AstNode[] = [];
  const templateNodes: AstNode[] = [];
  walkForImportsAndTemplates(program, importNodes, templateNodes);

  const importMap = buildImportMapFromNodes(importNodes);
  if (importMap.size === 0) {
    return undefined;
  }

  const styledImportName = findStyledImportNameFromNodes(importNodes);
  const cssImportNames = findCssImportNamesFromNodes(importNodes);
  if (!styledImportName && cssImportNames.size === 0) {
    return undefined;
  }

  const selectorLocals = findComponentSelectorLocalsFromNodes(
    templateNodes,
    styledImportName ?? "",
    cssImportNames,
  );
  if (selectorLocals.size === 0) {
    return undefined;
  }

  const usages: CrossFileSelectorUsage[] = [];
  for (const localName of selectorLocals) {
    const imp = importMap.get(localName);
    if (!imp || imp.source === "styled-components") {
      continue;
    }

    usages.push({
      localName,
      importSource: imp.source,
      importedName: imp.importedName,
      resolvedPath: `/synthetic/${imp.source}`,
    });
  }

  if (usages.length === 0) {
    return undefined;
  }

  return { selectorUsages: usages };
}

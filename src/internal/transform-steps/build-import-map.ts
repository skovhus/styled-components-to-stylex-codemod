/**
 * Step: build import map for adapter resolution.
 * Core concepts: identifier mapping and import source tracking.
 */
import { CONTINUE, type StepResult } from "../transform-types.js";
import { buildImportMap } from "../transform-import-map.js";
import { TransformContext } from "../transform-context.js";

/**
 * Builds a map of local identifiers to their import sources for later resolution.
 */
export function buildImportMapStep(ctx: TransformContext): StepResult {
  ctx.importMap = buildImportMap({ root: ctx.root, j: ctx.j, filePath: ctx.file.path });
  return CONTINUE;
}

/**
 * Public entry point for the codemod API.
 * Core concepts: adapter configuration and transform execution.
 */
export { defineAdapter } from "./adapter.js";
export type { AdapterInput, ImportSource, MarkerFileContext } from "./adapter.js";
export { runTransform } from "./run.js";
export { analyzeMigrationPlan, formatMigrationPlan } from "./migration-plan.js";
export type {
  ImportedExportUsage,
  ManualConversionFile,
  ManualConversionReason,
  MigrationPlan,
  MigrationPlanOptions,
} from "./migration-plan.js";

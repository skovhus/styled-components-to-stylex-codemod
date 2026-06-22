/**
 * Prints the ordered list of files that must be converted by hand before the
 * codemod can finish the rest of the migration (bottom-up dependency order).
 *
 * This is an analysis-only mode: it never writes files. For each blocking file it
 * reports how many consumers it has, which exports those consumers import, and
 * why the codemod cannot convert it automatically.
 *
 * Usage:
 *   node scripts/migration-plan.mts
 *     Analyzes the repo's own test-cases using the fixture adapter.
 *
 *   node scripts/migration-plan.mts --files "src/**\/*.tsx" --consumers "src/**\/*.tsx"
 *     Analyzes a custom file/consumer glob (still uses the fixture adapter).
 *
 * To analyze your own project, import `analyzeMigrationPlan` / `formatMigrationPlan`
 * from the package and pass your own adapter — see README.
 */
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { register } from "node:module";

// Allow Node to run `src/*.ts` directly even though source uses `.js` specifiers.
register(new URL("./src-ts-specifier-loader.mjs", import.meta.url).href, pathToFileURL(".."));

const [{ analyzeMigrationPlan, formatMigrationPlan }, { fixtureAdapter }, { Logger }] =
  await Promise.all([
    import("../src/migration-plan.ts"),
    import("../src/__tests__/fixture-adapters.ts"),
    import("../src/internal/logger.ts"),
  ]);

// Keep stdout clean for the plan itself; prepass progress goes through Logger.info.
Logger.info = () => {};

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, "..");

function parseArg(flag: string): string | undefined {
  const index = process.argv.indexOf(flag);
  return index !== -1 ? process.argv[index + 1] : undefined;
}

const files = parseArg("--files") ?? join(repoRoot, "test-cases", "*.input.tsx");
const consumersArg = parseArg("--consumers");
const consumerPaths =
  consumersArg ?? (parseArg("--files") ? files : join(repoRoot, "test-cases", "*.input.tsx"));

const plan = await analyzeMigrationPlan({
  files,
  consumerPaths,
  adapter: fixtureAdapter,
  parser: "tsx",
});

process.stdout.write(formatMigrationPlan(plan) + "\n");

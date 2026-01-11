// Backwards-compatible runner. Prefer:
//   node scripts/update-fixtures.mjs --only name1,name2
//
// This uses a small loader so Node can run the `src/*.ts` sources that import `./foo.js`.
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const loaderPath = join(__dirname, "src-ts-specifier-loader.mjs");
const entryPath = join(__dirname, "update-fixtures.mts");

const res = spawnSync(
  process.execPath,
  ["--loader", loaderPath, entryPath, ...process.argv.slice(2)],
  { stdio: "inherit" },
);

process.exit(res.status ?? 1);

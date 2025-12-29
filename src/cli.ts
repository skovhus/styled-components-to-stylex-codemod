#!/usr/bin/env node

import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import { existsSync } from "node:fs";
import { run as jscodeshiftRun } from "jscodeshift/src/Runner.js";
import type { Adapter } from "./adapter.js";
import { defaultAdapter } from "./adapter.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const args = process.argv.slice(2);

if (args.length === 0 || args.includes("--help") || args.includes("-h")) {
  console.log(`
styled-components-to-stylex - Transform styled-components to StyleX

Usage:
  npx styled-components-to-stylex [options] <path>

Options:
  --adapter <path>   Path to adapter module (must export default Adapter)
  --dry              Dry run (don't modify files)
  --print            Print output to stdout
  --help, -h         Show this help message

Examples:
  npx styled-components-to-stylex src/
  npx styled-components-to-stylex --dry src/components/
  npx styled-components-to-stylex --adapter ./my-adapter.js src/
`);
  process.exit(0);
}

// Parse --adapter option
let adapterPath: string | undefined;
const filteredArgs: string[] = [];

for (let i = 0; i < args.length; i++) {
  if (args[i] === "--adapter") {
    const nextArg = args[i + 1];
    if (!nextArg || nextArg.startsWith("--")) {
      console.error("Error: --adapter requires a path argument");
      process.exit(1);
    }
    adapterPath = nextArg;
    i++; // Skip next arg
  } else {
    filteredArgs.push(args[i]!);
  }
}

/**
 * Validate that an adapter has the required interface
 */
function validateAdapter(adapter: unknown, path: string): adapter is Adapter {
  if (!adapter || typeof adapter !== "object") {
    console.error(`Error: Adapter at ${path} must export an object`);
    return false;
  }

  const a = adapter as Record<string, unknown>;

  if (typeof a.transformValue !== "function") {
    console.error(
      `Error: Adapter at ${path} must have a transformValue() method`
    );
    return false;
  }

  if (typeof a.getImports !== "function") {
    console.error(`Error: Adapter at ${path} must have a getImports() method`);
    return false;
  }

  if (typeof a.getDeclarations !== "function") {
    console.error(
      `Error: Adapter at ${path} must have a getDeclarations() method`
    );
    return false;
  }

  return true;
}

/**
 * Load and validate a custom adapter
 */
async function loadCustomAdapter(
  absolutePath: string
): Promise<Adapter | null> {
  try {
    // Use dynamic import with file:// URL for cross-platform compatibility
    const moduleUrl = `file://${absolutePath}`;
    const module = (await import(moduleUrl)) as {
      default?: unknown;
      [key: string]: unknown;
    };

    // Check for default export first, then named export
    const adapter = module.default ?? module;

    if (!validateAdapter(adapter, absolutePath)) {
      return null;
    }

    return adapter;
  } catch (error) {
    const err = error as Error;
    console.error(`Error loading adapter from ${absolutePath}: ${err.message}`);
    return null;
  }
}

async function main() {
  // Resolve adapter
  let adapter: Adapter = defaultAdapter;

  if (adapterPath) {
    // Resolve custom adapter path
    const absolutePath = resolve(process.cwd(), adapterPath);
    if (!existsSync(absolutePath)) {
      console.error(`Error: Adapter file not found: ${absolutePath}`);
      process.exit(1);
    }

    // Load and validate the adapter
    const customAdapter = await loadCustomAdapter(absolutePath);
    if (!customAdapter) {
      process.exit(1);
    }

    adapter = customAdapter;
    console.log(`Loaded adapter from ${absolutePath}`);
  }

  const transformPath = join(__dirname, "transform.mjs");

  // Parse jscodeshift-specific options from filteredArgs
  const paths: string[] = [];
  let dry = false;
  let print = false;

  for (const arg of filteredArgs) {
    if (arg === "--dry") {
      dry = true;
    } else if (arg === "--print") {
      print = true;
    } else if (!arg.startsWith("--")) {
      paths.push(arg);
    }
  }

  if (paths.length === 0) {
    console.error("Error: No files or directories specified");
    process.exit(1);
  }

  // Use jscodeshift programmatically to pass adapter object directly
  const result = await jscodeshiftRun(transformPath, paths, {
    parser: "tsx",
    dry,
    print,
    adapter, // Pass the actual Adapter object
  });

  // Exit with appropriate code based on results
  if (result.error > 0) {
    process.exit(1);
  }
  process.exit(0);
}

main();

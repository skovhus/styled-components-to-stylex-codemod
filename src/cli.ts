#!/usr/bin/env node
import { existsSync } from "node:fs";
import { stat } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { runTransform } from "./run.js";
import type { Adapter } from "./adapter.js";
import { defaultAdapter, defineVarsAdapter, inlineValuesAdapter } from "./adapter.js";
import type { DynamicNodePlugin } from "./plugins.js";
import type { UserHook } from "./hook.js";

type CliFlags = {
  hookPath?: string;
  adapterPath?: string;
  dryRun: boolean;
  print: boolean;
  parser: "babel" | "babylon" | "flow" | "ts" | "tsx";
  inputs: string[];
};

function printHelp(): void {
  console.log(`
styled-components-to-stylex - Transform styled-components to StyleX

Usage:
  npx styled-components-to-stylex [options] <path|glob> [more paths/globs...]

Options:
  --hook <path>      Path to a custom hook module (recommended)
  --adapter <path>   Alias for --hook (kept for backwards compatibility)
  --dry              Dry run (don't modify files)
  --print            Print output to stdout
  --parser <name>    Parser (babel|babylon|flow|ts|tsx). Default: tsx
  --help, -h         Show this help message

Built-in adapters (use with --hook or --adapter):
  cssVariables       CSS custom properties with fallbacks (default)
  defineVars         Reference StyleX vars (example adapter)
  inlineValues       Inline literal values (example adapter)

Hook module shapes supported:
  - default export: { adapter?, plugins? }
  - default export: Adapter (adapter-only)
  - named exports: adapter, plugins

Examples:
  npx styled-components-to-stylex src/
  npx styled-components-to-stylex --dry src/components/
  npx styled-components-to-stylex --hook ./stylex-codemod-hook.ts src/
  npx styled-components-to-stylex --adapter ./my-adapter.js src/
  npx styled-components-to-stylex --hook defineVars src/
`);
}

function parseArgs(argv: string[]): CliFlags {
  const args = argv.slice(2);
  const out: CliFlags = {
    dryRun: false,
    print: false,
    parser: "tsx",
    inputs: [],
  };

  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (!a) continue;

    if (a === "--help" || a === "-h") {
      printHelp();
      process.exit(0);
    }
    if (a === "--dry") {
      out.dryRun = true;
      continue;
    }
    if (a === "--print") {
      out.print = true;
      continue;
    }
    if (a === "--parser") {
      const next = args[i + 1];
      if (!next || next.startsWith("--")) {
        console.error("Error: --parser requires a value");
        process.exit(1);
      }
      if (!["babel", "babylon", "flow", "ts", "tsx"].includes(next)) {
        console.error(`Error: invalid parser: ${next}`);
        process.exit(1);
      }
      out.parser = next as CliFlags["parser"];
      i++;
      continue;
    }

    if (a === "--hook") {
      const next = args[i + 1];
      if (!next || next.startsWith("--")) {
        console.error("Error: --hook requires a path argument");
        process.exit(1);
      }
      out.hookPath = next;
      i++;
      continue;
    }
    if (a === "--adapter") {
      const next = args[i + 1];
      if (!next || next.startsWith("--")) {
        console.error("Error: --adapter requires a path argument");
        process.exit(1);
      }
      out.adapterPath = next;
      i++;
      continue;
    }

    out.inputs.push(a);
  }

  return out;
}

function isAdapter(x: unknown): x is Adapter {
  if (!x || typeof x !== "object") return false;
  const a = x as Record<string, unknown>;
  return (
    typeof a.transformValue === "function" &&
    typeof a.getImports === "function" &&
    typeof a.getDeclarations === "function"
  );
}

function normalizeHookModule(mod: Record<string, unknown>): UserHook {
  // named exports
  const namedAdapter = mod.adapter;
  const namedPlugins = mod.plugins;

  // default export
  const def = mod.default as unknown;

  const candidate =
    def ?? (namedAdapter || namedPlugins ? { adapter: namedAdapter, plugins: namedPlugins } : {});

  // Adapter-only module: default export is an Adapter object
  if (isAdapter(candidate)) return { adapter: candidate };

  // Hook module: { adapter?, plugins? }
  if (candidate && typeof candidate === "object") {
    const c = candidate as { adapter?: unknown; plugins?: unknown };
    const adapter = isAdapter(c.adapter) ? (c.adapter as Adapter) : undefined;
    const plugins = Array.isArray(c.plugins) ? (c.plugins as DynamicNodePlugin[]) : undefined;
    if (adapter || plugins) {
      const hook: UserHook = {};
      if (adapter) hook.adapter = adapter;
      if (plugins) hook.plugins = plugins;
      return hook;
    }
  }

  // named exports fallback
  const adapter = isAdapter(namedAdapter) ? (namedAdapter as Adapter) : undefined;
  const plugins = Array.isArray(namedPlugins) ? (namedPlugins as DynamicNodePlugin[]) : undefined;
  if (adapter || plugins) {
    const hook: UserHook = {};
    if (adapter) hook.adapter = adapter;
    if (plugins) hook.plugins = plugins;
    return hook;
  }

  return {};
}

function builtinHook(name: string): UserHook | null {
  if (name === "cssVariables") return { adapter: defaultAdapter };
  if (name === "defineVars") return { adapter: defineVarsAdapter };
  if (name === "inlineValues") return { adapter: inlineValuesAdapter };
  return null;
}

async function resolveInputs(inputs: string[]): Promise<string[]> {
  const patterns: string[] = [];
  for (const input of inputs) {
    const abs = resolve(process.cwd(), input);
    try {
      const st = await stat(abs);
      if (st.isDirectory()) {
        patterns.push(`${abs}/**/*.{js,jsx,ts,tsx}`);
      } else {
        patterns.push(abs);
      }
    } catch {
      // Not a file/dir; treat as glob pattern as-is (relative to cwd)
      patterns.push(input);
    }
  }
  return patterns;
}

async function loadUserHook(hookPath: string): Promise<UserHook> {
  const builtin = builtinHook(hookPath);
  if (builtin) return builtin;

  const abs = resolve(process.cwd(), hookPath);
  if (!existsSync(abs)) {
    console.error(`Error: Hook file not found: ${abs}`);
    process.exit(1);
  }

  try {
    const mod = (await import(pathToFileURL(abs).toString())) as Record<string, unknown>;
    return normalizeHookModule(mod);
  } catch (error) {
    const err = error as Error;
    console.error(`Error loading hook from ${abs}: ${err.message}`);
    process.exit(1);
  }
}

async function main(): Promise<void> {
  const flags = parseArgs(process.argv);

  if (flags.inputs.length === 0) {
    printHelp();
    process.exit(1);
  }

  const hookArg = flags.hookPath ?? flags.adapterPath;
  const hook = hookArg ? await loadUserHook(hookArg) : undefined;

  const files = await resolveInputs(flags.inputs);

  await runTransform({
    files,
    ...(hook ? { hook } : {}),
    dryRun: flags.dryRun,
    print: flags.print,
    parser: flags.parser,
  });
}

main().catch((e) => {
  const err = e as Error;
  console.error(err?.stack ?? String(err));
  process.exit(1);
});

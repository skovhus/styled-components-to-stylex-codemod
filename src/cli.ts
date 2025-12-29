#!/usr/bin/env node

import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { existsSync } from 'node:fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const args = process.argv.slice(2);

if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
  console.log(`
styled-components-to-stylex - Transform styled-components to StyleX

Usage:
  npx styled-components-to-stylex [options] <path>

Options:
  --adapter <path>   Path to custom adapter module (must export default Adapter)
  --dry              Dry run (don't modify files)
  --print            Print output to stdout
  --help, -h         Show this help message

Built-in adapters (use with --adapter):
  cssVariables       CSS custom properties with fallbacks (default)
  defineVars         StyleX defineVars references
  inlineValues       Inline literal values

Examples:
  npx styled-components-to-stylex src/
  npx styled-components-to-stylex --dry src/components/
  npx styled-components-to-stylex --adapter ./my-adapter.js src/
  npx styled-components-to-stylex --adapter defineVars src/
`);
  process.exit(0);
}

// Parse --adapter option
let adapterPath: string | undefined;
const filteredArgs: string[] = [];

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--adapter') {
    const nextArg = args[i + 1];
    if (!nextArg || nextArg.startsWith('--')) {
      console.error('Error: --adapter requires a path argument');
      process.exit(1);
    }
    adapterPath = nextArg;
    i++; // Skip next arg
  } else {
    filteredArgs.push(args[i]!);
  }
}

// Resolve adapter path
let resolvedAdapterPath: string | undefined;
if (adapterPath) {
  // Check if it's a built-in adapter name
  const builtInAdapters = ['cssVariables', 'defineVars', 'inlineValues'];
  if (builtInAdapters.includes(adapterPath)) {
    resolvedAdapterPath = `builtin:${adapterPath}`;
  } else {
    // Resolve custom adapter path
    resolvedAdapterPath = resolve(process.cwd(), adapterPath);
    if (!existsSync(resolvedAdapterPath)) {
      console.error(`Error: Adapter file not found: ${resolvedAdapterPath}`);
      process.exit(1);
    }
  }
}

const transformPath = join(__dirname, 'transform.mjs');

const jscodeshiftArgs = [
  '--parser=tsx',
  `--transform=${transformPath}`,
  ...(resolvedAdapterPath ? [`--adapter=${resolvedAdapterPath}`] : []),
  ...filteredArgs,
];

const jscodeshift = spawn('npx', ['jscodeshift', ...jscodeshiftArgs], {
  stdio: 'inherit',
  shell: true,
});

jscodeshift.on('close', (code) => {
  process.exit(code ?? 0);
});

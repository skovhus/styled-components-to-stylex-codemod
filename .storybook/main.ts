import type { StorybookConfig } from "@storybook/react-vite";
import type { Indexer } from "storybook/internal/types";
import type { Plugin } from "vite";
import stylex from "@stylexjs/unplugin";
import * as fs from "node:fs";
import * as path from "node:path";

// Get all test case names from the test-cases directory
function getTestCaseNames(testCasesDir: string): string[] {
  const files = fs.readdirSync(testCasesDir);
  const testCaseNames = new Set<string>();
  for (const file of files) {
    const match = file.match(/^(.+?)(?:\.flow)?\.(input|output)\.(?:tsx|jsx)$/);
    if (match && !match[1].startsWith("_unsupported.") && match[1] !== "complex") {
      testCaseNames.add(match[1]);
    }
  }
  return [...testCaseNames].sort();
}

// Custom indexer to generate individual stories for each test case
const testCaseIndexer: Indexer = {
  test: /TestCases\.stories\.tsx$/,
  createIndex: async (fileName) => {
    const testCasesDir = path.dirname(fileName);
    const testCaseNames = getTestCaseNames(testCasesDir);

    // Generate index entries for each test case
    const entries = [
      // The "All" story
      {
        type: "story" as const,
        importPath: fileName,
        exportName: "All",
        title: "Test Cases",
        name: "All",
      },
    ];

    // Add individual test case stories
    // Export name uses underscores (valid JS identifier), name keeps hyphens (display name)
    // Note: Storybook auto-generates story IDs by kebab-casing the name, so
    // "theme-conditionalInlineStyle" becomes "test-cases--theme-conditional-inline-style".
    // The verify-storybook-rendering script accounts for this conversion.
    for (const name of testCaseNames) {
      entries.push({
        type: "story" as const,
        importPath: fileName,
        exportName: name.replace(/-/g, "_"),
        title: "Test Cases",
        name: name,
      });
    }

    return entries;
  },
};

// Vite plugin to inject dynamic test case story exports into TestCases.stories.tsx
function testCaseStoriesPlugin(): Plugin {
  const MARKER = "// GENERATED_STORIES_MARKER";

  return {
    name: "test-case-stories",
    enforce: "pre",
    transform(code, id) {
      // Only transform the TestCases.stories.tsx file
      if (!id.endsWith("TestCases.stories.tsx")) {
        return null;
      }

      // Check if the marker exists
      if (!code.includes(MARKER)) {
        return null;
      }

      const testCasesDir = path.dirname(id);
      const testCaseNames = getTestCaseNames(testCasesDir);

      // Generate the export statements
      // Export name uses underscores to be a valid JS identifier
      const exports = testCaseNames
        .map((name) => {
          const exportName = name.replace(/-/g, "_");
          return `export const ${exportName} = createTestCaseStory("${name}");`;
        })
        .join("\n");

      // Replace the marker with the generated exports
      const transformedCode = code.replace(MARKER, exports);

      return {
        code: transformedCode,
        map: null,
      };
    },
  };
}

const config: StorybookConfig = {
  stories: ["../test-cases/**/*.stories.@(js|jsx|mjs|ts|tsx)"],
  experimental_indexers: (existingIndexers) => [testCaseIndexer, ...(existingIndexers ?? [])],
  framework: {
    name: "@storybook/react-vite",
    options: {},
  },
  viteFinal: async (config) => {
    config.plugins = config.plugins || [];

    config.plugins.unshift(
      stylex.vite({
        dev: true,
        unstable_moduleResolution: {
          type: "commonJS",
          rootDir: process.cwd(),
        },
      }),
    );

    // Add plugin to generate test case story exports
    config.plugins.push(testCaseStoriesPlugin());

    // Force esbuild to treat .ts files as tsx with automatic JSX runtime
    config.esbuild = {
      ...config.esbuild,
      loader: "tsx",
      include: /\.(ts|tsx|js|jsx)$/,
      jsx: "automatic",
    };

    // Also configure optimizeDeps for pre-bundling
    config.optimizeDeps = {
      ...config.optimizeDeps,
      esbuildOptions: {
        ...config.optimizeDeps?.esbuildOptions,
        loader: {
          ".ts": "tsx",
        },
        jsx: "automatic",
      },
    };

    config.build = {
      ...config.build,
      chunkSizeWarningLimit: 2000,
    };

    return config;
  },
};

export default config;

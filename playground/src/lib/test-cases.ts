import type { ComponentType } from "react";

// Auto-import all test case input files as raw strings
const inputs = import.meta.glob<string>(
  [
    "../../../test-cases/*.input.tsx",
    // Exclude bail-out fixtures from bundling (these may contain intentionally broken imports).
    "!../../../test-cases/_unsupported.*.input.tsx",
    "!../../../test-cases/_unimplemented.*.input.tsx",
  ],
  {
    query: "?raw",
    import: "default",
    eager: true,
  },
);

type TestCaseModule = {
  App: ComponentType<Record<string, never>>;
};

type TestCaseModuleLoader = () => Promise<TestCaseModule>;

const inputModuleLoaders = import.meta.glob<TestCaseModule>([
  "../../../test-cases/*.input.tsx",
  "!../../../test-cases/_unsupported.*.input.tsx",
  "!../../../test-cases/_unimplemented.*.input.tsx",
]);
const outputModuleLoaders = import.meta.glob<TestCaseModule>([
  "../../../test-cases/*.output.tsx",
  "!../../../test-cases/_unsupported.*.output.tsx",
  "!../../../test-cases/_unimplemented.*.output.tsx",
]);

interface TestCase {
  name: string;
  content: string;
}

export const testCases: TestCase[] = Object.entries(inputs)
  // Extract name and content
  .map(([path, content]) => ({
    name: path.match(/\/([^/]+)\.input\.tsx$/)?.[1] ?? path,
    content,
  }))
  // Exclude bail-out fixtures from the playground UI.
  // (These exist to document unsupported/unimplemented behavior and have no `.output.tsx`.)
  .filter((t) => !t.name.startsWith("_unsupported.") && !t.name.startsWith("_unimplemented."))
  // Sort alphabetically
  .sort((a, b) => {
    return a.name.localeCompare(b.name);
  });

export async function loadTestCaseModule(
  name: string,
  type: "input" | "output",
): Promise<TestCaseModule | null> {
  if (!name) {
    return null;
  }

  if (name.startsWith("_unsupported.") || name.startsWith("_unimplemented.")) {
    return null;
  }

  const modules = type === "input" ? inputModuleLoaders : outputModuleLoaders;
  const loader = getModuleLoader(modules, name, type);
  if (!loader) {
    return null;
  }

  return loader();
}

function getModulePath(name: string, type: "input" | "output"): string {
  return `../../../test-cases/${name}.${type}.tsx`;
}

function getModuleLoader(
  modules: Record<string, TestCaseModuleLoader>,
  name: string,
  type: "input" | "output",
): TestCaseModuleLoader | undefined {
  return modules[getModulePath(name, type)];
}

// Auto-import all test case input files as raw strings
const inputs = import.meta.glob<string>("../../../test-cases/*.input.tsx", {
  query: "?raw",
  import: "default",
  eager: true,
});

export interface TestCase {
  name: string;
  content: string;
}

export const testCases: TestCase[] = Object.entries(inputs)
  // Filter out unsupported test cases
  .filter(([path]) => !path.includes("_unsupported"))
  // Extract name and content
  .map(([path, content]) => ({
    name: path.match(/\/([^/]+)\.input\.tsx$/)?.[1] ?? path,
    content,
  }))
  // Sort alphabetically
  .sort((a, b) => a.name.localeCompare(b.name));

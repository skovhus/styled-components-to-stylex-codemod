// Auto-import all test case input files as raw strings
const inputs = import.meta.glob<string>("../../../test-cases/*.input.tsx", {
  query: "?raw",
  import: "default",
  eager: true,
});

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
  // Sort alphabetically, but put _unsupported at the bottom
  .sort((a, b) => {
    const aUnsupported = a.name.startsWith("_unsupported");
    const bUnsupported = b.name.startsWith("_unsupported");
    if (aUnsupported && !bUnsupported) {
      return 1;
    }
    if (!aUnsupported && bUnsupported) {
      return -1;
    }
    return a.name.localeCompare(b.name);
  });

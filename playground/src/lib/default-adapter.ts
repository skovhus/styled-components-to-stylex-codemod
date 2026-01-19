// Import the actual fixture-adapters source code
import fixtureAdaptersSource from "../../../src/__tests__/fixture-adapters.ts?raw";

// Strip TypeScript-specific syntax so the code can be eval'd as JavaScript
function stripTypeScript(code: string): string {
  return (
    code
      // Remove "as const" assertions
      .replace(/\s+as\s+const/g, "")
      // Remove type annotations like ": string" or ": Record<string, string>"
      // Note: Only matches simple types and generics, not inline object types to avoid matching object literals
      .replace(/:\s*(?:string|number|boolean|Record<[^>]+>|Array<[^>]+>)\s*(?=[,;=)])/g, "")
  );
}

// Extract just the fixtureAdapter object from the source (without imports and customAdapter)
function extractFixtureAdapter(source: string): string {
  const externalPathsMatch = source.match(/const\s+externalStylingFilePaths\s*=\s*\[[\s\S]*?\n\];/);
  const externalPathsCode = externalPathsMatch?.[0]
    ? stripTypeScript(externalPathsMatch[0])
    : "const externalStylingFilePaths = [];";

  // Find the fixtureAdapter definition and extract the object inside defineAdapter({...})
  const match = source.match(/export const fixtureAdapter = defineAdapter\((\{[\s\S]*?\n\})\);/);
  if (match?.[1]) {
    const jsCode = stripTypeScript(match[1]);
    return `// Edit to customize\n(() => {\n  ${externalPathsCode}\n  return ${jsCode};\n})()`;
  }
  return "// Could not extract fixtureAdapter\n{}";
}

// Export the extracted adapter code for display in the editor
export const DEFAULT_ADAPTER_CODE = extractFixtureAdapter(fixtureAdaptersSource);

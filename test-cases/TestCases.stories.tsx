import type { Meta, StoryObj } from "@storybook/react";
import React from "react";
import { ThemeProvider } from "styled-components";
import { testCaseTheme } from "./tokens.stylex";

// Auto-discover all test case modules using Vite's glob import
const inputModules = import.meta.glob<{ App: React.ComponentType }>("./*.input.tsx", {
  eager: true,
});
const outputModules = import.meta.glob<{ App: React.ComponentType }>("./*.output.tsx", {
  eager: true,
});

// Extract test case names from file paths
function getTestCaseName(path: string): string {
  const match = path.match(/\.\/(.+)\.(input|output)\.tsx$/);
  return match?.[1] ?? path;
}

// Get unique test case names
const testCaseNames = [
  ...new Set([
    ...Object.keys(inputModules).map(getTestCaseName),
    ...Object.keys(outputModules).map(getTestCaseName),
  ]),
]
  // Exclude `_unsupported.*` fixtures from Storybook comparisons.
  // (We keep these in-repo to document unsupported behavior, but don't render them side-by-side.)
  .filter((name) => !name.startsWith("_unsupported."))
  .sort();

// Comparison component that renders input and output side by side
interface ComparisonProps {
  testCase: string;
}

const Comparison: React.FC<ComparisonProps> = ({ testCase }) => {
  const inputPath = `./${testCase}.input.tsx`;
  const outputPath = `./${testCase}.output.tsx`;

  const InputComponent = inputModules[inputPath]?.App;
  const OutputComponent = outputModules[outputPath]?.App;

  return (
    <div style={{ display: "flex", gap: "2rem", padding: "1rem" }}>
      <div style={{ flex: 1 }}>
        <h3 style={{ margin: "0 0 1rem", fontFamily: "system-ui" }}>Input (styled-components)</h3>
        <div
          style={{
            border: "1px solid #e0e0e0",
            borderRadius: "8px",
            padding: "1rem",
            background: "#fafafa",
          }}
        >
          {InputComponent ? (
            <ThemeProvider theme={testCaseTheme}>
              <InputComponent />
            </ThemeProvider>
          ) : (
            <div style={{ color: "#999" }}>No input file found</div>
          )}
        </div>
      </div>
      <div style={{ flex: 1 }}>
        <h3 style={{ margin: "0 0 1rem", fontFamily: "system-ui" }}>Output (StyleX)</h3>
        <div
          style={{
            border: "1px solid #e0e0e0",
            borderRadius: "8px",
            padding: "1rem",
            background: "#fafafa",
          }}
        >
          {OutputComponent ? (
            <OutputComponent />
          ) : (
            <div style={{ color: "#999" }}>No output file found</div>
          )}
        </div>
      </div>
    </div>
  );
};

// Component that renders all test cases
const AllTestCases: React.FC = () => (
  <div>
    {testCaseNames.map((name) => (
      <div key={name} id={`testcase-${name}`} style={{ marginBottom: "2rem" }}>
        <h2
          style={{
            fontFamily: "system-ui",
            padding: "0 1rem",
            margin: "1rem 0",
            borderBottom: "1px solid #e0e0e0",
            paddingBottom: "0.5rem",
          }}
        >
          {name}
        </h2>
        <Comparison testCase={name} />
      </div>
    ))}
  </div>
);

const meta: Meta = {
  title: "Test Cases",
  parameters: {
    layout: "fullscreen",
  },
};

export default meta;

type Story = StoryObj;

// Story showing all test cases on one page - this is the main entry point
// All test cases are auto-discovered and rendered side-by-side
export const All: Story = {
  render: () => <AllTestCases />,
};

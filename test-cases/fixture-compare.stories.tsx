import type { Meta, StoryObj } from "@storybook/react";
import React from "react";

type FixtureModule = { App?: React.ComponentType<unknown> };

// Dynamically import all fixtures (excluding _unsupported* files and known broken outputs)
// Broken outputs: component-selector, sibling-selectors, string-interpolation, with-config
// These have invalid StyleX syntax that the transformer produces but requires manual fixing
const inputModules = import.meta.glob<FixtureModule>(
  ["./*.input.tsx", "!./_*.input.tsx"],
  {
    eager: true,
  }
);
const outputModules = import.meta.glob<FixtureModule>(
  [
    "./*.output.tsx",
    "!./_*.output.tsx",
    "!./component-selector.output.tsx",
    "!./sibling-selectors.output.tsx",
    "!./string-interpolation.output.tsx",
    "!./with-config.output.tsx",
  ],
  { eager: true }
);

function fileToName(path: string): string {
  // ./basic.input.tsx -> basic
  return path
    .replace(/^\.\//, "")
    .replace(/\.input\.tsx$/, "")
    .replace(/\.output\.tsx$/, "");
}

// Filter out unsupported fixtures (those starting with _)
const fixtureNames = [
  ...new Set([
    ...Object.keys(inputModules).map(fileToName),
    ...Object.keys(outputModules).map(fileToName),
  ]),
]
  .filter((name) => !name.startsWith("_"))
  .sort();

type CompareProps = { name: string };

function Compare({ name }: CompareProps) {
  const inputKey = `./${name}.input.tsx`;
  const outputKey = `./${name}.output.tsx`;

  const InputApp = inputModules[inputKey]?.App;
  const OutputApp = outputModules[outputKey]?.App;

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "1fr 1fr",
        gap: 16,
        alignItems: "start",
      }}
    >
      <div style={{ border: "1px solid #ddd", padding: 12 }}>
        <div
          style={{
            fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
            fontSize: 12,
          }}
        >
          Input (styled-components): {name}
        </div>
        <div style={{ marginTop: 12 }}>
          {InputApp ? <InputApp /> : <div>Missing {inputKey}</div>}
        </div>
      </div>

      <div style={{ border: "1px solid #ddd", padding: 12 }}>
        <div
          style={{
            fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
            fontSize: 12,
          }}
        >
          Output (StyleX): {name}
        </div>
        <div style={{ marginTop: 12 }}>
          {OutputApp ? <OutputApp /> : <div>Missing {outputKey}</div>}
        </div>
      </div>
    </div>
  );
}

const meta: Meta<typeof Compare> = {
  title: "fixtures/compare",
  component: Compare,
  args: {
    name: fixtureNames[0] ?? "basic",
  },
  argTypes: {
    name: {
      control: "select",
      options: fixtureNames,
    },
  },
};

export default meta;

type Story = StoryObj<typeof Compare>;

export const SideBySide: Story = {};

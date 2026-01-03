import type { Meta, StoryObj } from "@storybook/react";
import React from "react";

type FixtureModule = { App?: React.ComponentType<any> };

// Keep Storybook lightweight/stable by only loading the fixture under active development.
// Many fixtures are intentionally "compiler-edge" and may not be valid StyleX at runtime yet.
import * as descendantInput from "./descendant-component-selector.input";
import * as descendantOutput from "./descendant-component-selector.output";

const inputModules = {
  "./descendant-component-selector.input.tsx": descendantInput,
} as Record<string, FixtureModule>;

const outputModules = {
  "./descendant-component-selector.output.tsx": descendantOutput,
} as Record<string, FixtureModule>;

function fileToName(path: string): string {
  // ./basic.input.tsx -> basic
  return path
    .replace(/^\.\//, "")
    .replace(/\.input\.tsx$/, "")
    .replace(/\.output\.tsx$/, "");
}

const fixtureNames = ["descendant-component-selector"];

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

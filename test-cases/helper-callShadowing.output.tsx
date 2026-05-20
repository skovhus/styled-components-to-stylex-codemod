import React from "react";
import * as stylex from "@stylexjs/stylex";
import { mergedSx } from "./lib/mergedSx";

// Test: When a local function shadows an imported helper inside a nested scope,
// the codemod should NOT resolve the local function call to the import.
// Instead, it should preserve the local call via inline style fallback.

function createThemedComponents() {
  // Local function shadows the imported `color` helper
  const color = (hex: string) => `#${hex}`;

  // This uses the LOCAL color function, not the imported helper.
  // The codemod should preserve the shadowed call via inline style fallback.
  function ThemedBox(props: React.ComponentProps<"div"> & { sx?: stylex.StyleXStyles }) {
    const { className, children, style, sx } = props;
    return (
      <div
        {...mergedSx(sx, className, {
          backgroundColor: color("ff0000"),
          ...style,
        })}
      >
        {children}
      </div>
    );
  }

  return ThemedBox;
}

export const App = () => {
  const ThemedBox = createThemedComponents();
  return <ThemedBox>Colored text</ThemedBox>;
};

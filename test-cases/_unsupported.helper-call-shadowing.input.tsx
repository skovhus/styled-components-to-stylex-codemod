// @expected-warning: Unsupported call expression (expected imported helper(...) or imported helper(...)(...))
import React from "react";
import styled from "styled-components";
import { color } from "./lib/helpers";

// Test: When a local function shadows an imported helper inside a nested scope,
// the codemod should NOT resolve the local function call to the import.
// Instead, it should bail because the shadowed call can't be safely resolved.

function createThemedComponents() {
  // Local function shadows the imported `color` helper
  const color = (hex: string) => `#${hex}`;

  // This uses the LOCAL color function, not the imported helper.
  // The codemod should bail because it can't resolve the shadowed call.
  const ThemedBox = styled.div`
    background: ${color("ff0000")};
  `;

  return ThemedBox;
}

export const App = () => {
  const ThemedBox = createThemedComponents();
  return <ThemedBox />;
};

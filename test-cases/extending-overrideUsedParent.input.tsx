// Extending a styled component that wraps an imported component, where parent is also used directly in JSX
import * as React from "react";
import styled from "styled-components";
import { Text } from "./lib/text";

// Non-exported styled component wrapping an imported component — used directly in JSX
const StyledText = styled(Text)`
  margin-left: 8px;
  color: blue;
`;

/** Exported child that extends the non-exported parent, overriding margin-left. */
export const HelpText = styled(StyledText)`
  margin-left: 4px;
`;

export const App = () => (
  <div>
    <StyledText>Direct use of parent (margin-left: 8px)</StyledText>
    <HelpText>Child overrides margin-left to 4px</HelpText>
  </div>
);

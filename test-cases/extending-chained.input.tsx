import * as React from "react";
import styled from "styled-components";
import { Text } from "./lib/text";

// Non-exported styled component that wraps an imported component
const StyledText = styled(Text)`
  margin-left: 8px;
`;

/** Styled text for form help messages - extends the non-exported StyledText. */
export const HelpText = styled(StyledText)`
  margin-left: 4px;
`;

/** Styled separator text between form elements - directly wraps Text. */
export const Separator = styled(Text)`
  margin-right: 4px;
`;

export const App = () => (
  <div>
    <HelpText>Help text content</HelpText>
    <Separator>|</Separator>
  </div>
);

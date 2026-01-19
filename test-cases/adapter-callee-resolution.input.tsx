import React from "react";
import styled from "styled-components";
import { fontWeight, fontSize, transitionSpeed } from "./lib/helpers";

/**
 * Test case for adapter callee resolution.
 * The adapter should resolve these helper function calls to StyleX variables.
 */
const StyledText = styled.span`
  font-weight: ${fontWeight("medium")};
  font-size: ${fontSize("medium")};
  transition: color ${transitionSpeed("fast")};
`;

const StyledButton = styled.button`
  font-weight: ${fontWeight("bold")};
  font-size: ${fontSize("small")};
  transition: background ${transitionSpeed("normal")};
  padding: 8px 16px;
`;

export function Text({ children }: { children: React.ReactNode }) {
  return <StyledText>{children}</StyledText>;
}

export function Button({ children }: { children: React.ReactNode }) {
  return <StyledButton>{children}</StyledButton>;
}

export const App = () => (
  <div>
    <Text>Hello World</Text>
    <Button>Click Me</Button>
  </div>
);

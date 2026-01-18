import React from "react";
import styled from "styled-components";

// Mock helper functions that would come from project mixins
// These are the callees that need adapter resolution:
// - fontWeight (from styles/mixins)
// - fontSize (from styles/mixins)
// - transitionSpeed (from styles/styled)
// - textSize (from components/Text)
// - thinBorderThemed (from styles/mixins)

const fontWeight = (weight: "normal" | "medium" | "bold") => {
  const weights = { normal: 400, medium: 500, bold: 600 };
  return weights[weight];
};

const fontSize = (size: "small" | "medium" | "large") => {
  const sizes = { small: "12px", medium: "14px", large: "16px" };
  return sizes[size];
};

const transitionSpeed = (type: "fast" | "normal" | "slow") => {
  const speeds = { fast: "100ms", normal: "200ms", slow: "300ms" };
  return speeds[type];
};

/**
 * Test case for adapter callee resolution.
 * The adapter should resolve these helper function calls.
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

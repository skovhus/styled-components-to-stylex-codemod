import React from "react";
import styled from "styled-components";

// Bug 5: Transient props ($-prefixed) should NOT be passed to DOM elements.
// styled-components automatically filters these out, but the generated
// StyleX wrapper must also filter them.

// When these are exported, they become wrapper functions that must:
// 1. Accept the transient props for styling decisions
// 2. NOT forward them to the underlying DOM element

export const Box = styled.div<{
  $isActive?: boolean;
  $size?: "small" | "large";
}>`
  padding: ${(props) => (props.$size === "large" ? "16px" : "8px")};
  background: ${(props) => (props.$isActive ? "blue" : "gray")};
  color: white;
`;

export const Image = styled.img<{ $isInactive?: boolean }>`
  opacity: ${(props) => (props.$isInactive ? 0.5 : 1)};
  border-radius: 50%;
`;

export function App() {
  return (
    <div>
      <Box $isActive $size="large">
        Active large box
      </Box>
      <Box $size="small">Small inactive box</Box>
      <Image $isInactive src="/avatar.png" alt="Avatar" />
    </div>
  );
}

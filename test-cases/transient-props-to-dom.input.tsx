import React from "react";
import styled from "styled-components";

// Bug 5: Transient props ($-prefixed) should NOT be passed to DOM elements.
// styled-components automatically filters these out, but the generated
// StyleX wrapper must also filter them.

// Pattern 1: Exported components - become wrapper functions that must:
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

// Pattern 2: Non-exported internal components with transient props
// These are used inline but still must NOT pass $-prefixed props to DOM
// (from ColorPicker.tsx - Point component with $pickerHeight)
const Point = styled.div<{ $pickerHeight?: number }>`
  position: absolute;
  left: -3px;
  width: 12px;
  height: 4px;
`;

const Slider = styled.div<{ $height: number }>`
  position: relative;
  height: ${(props) => props.$height}px;
`;

export function App() {
  const pickerHeight = 200;
  return (
    <div>
      <Box $isActive $size="large">
        Active large box
      </Box>
      <Box $size="small">Small inactive box</Box>
      <Image $isInactive src="/avatar.png" alt="Avatar" />
      {/* Internal components with transient props */}
      <Point $pickerHeight={pickerHeight} />
      <Slider $height={pickerHeight}>Slider content</Slider>
    </div>
  );
}

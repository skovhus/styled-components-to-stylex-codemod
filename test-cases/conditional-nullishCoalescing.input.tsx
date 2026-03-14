import React from "react";
import styled from "styled-components";

// Styled hr
const Divider = styled.hr<{ $color?: string }>`
  border: none;
  height: 1px;
  background: ${(props) => props.$color ?? "#e0e0e0"};
  margin: 16px 0;
`;

// Nullish coalescing with numeric fallback and unit suffix
const FadeBox = styled.div<{ $delay?: number }>`
  transition-delay: ${(props) => props.$delay ?? 0}ms;
  transition-property: opacity;
  transition-duration: 200ms;
  transition-timing-function: ease-out;
`;

export const App = () => (
  <div>
    <Divider />
    <Divider $color="#bf4f74" />
    <FadeBox>Default delay</FadeBox>
    <FadeBox $delay={100}>Custom delay</FadeBox>
  </div>
);

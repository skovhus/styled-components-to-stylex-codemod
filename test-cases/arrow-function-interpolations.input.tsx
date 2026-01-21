import React from "react";
import styled from "styled-components";

// Arrow function in background (10 occurrences)
const GradientBox = styled.div<{ $direction?: "horizontal" | "vertical" }>`
  background: ${(props) =>
    props.$direction === "horizontal"
      ? "linear-gradient(90deg, #bf4f74, #3498db)"
      : "linear-gradient(180deg, #bf4f74, #3498db)"};
  padding: 24px;
`;

// Arrow function in border-bottom (6 occurrences)
const TabItem = styled.div<{ $isActive?: boolean }>`
  padding: 12px 16px;
  border-bottom: ${(props) => (props.$isActive ? "2px solid #bf4f74" : "2px solid transparent")};
  cursor: pointer;
`;

export const App = () => (
  <div>
    <GradientBox $direction="horizontal">Horizontal Gradient</GradientBox>
    <TabItem $isActive>Active Tab</TabItem>
    <TabItem>Inactive Tab</TabItem>
  </div>
);

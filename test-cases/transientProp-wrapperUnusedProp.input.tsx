// Transient prop inherited by wrapper that uses prop in its own template
import styled from "styled-components";
import * as React from "react";

export const Scrollable = styled.div<{ $applyBackground?: boolean }>`
  overflow: auto;
  background-color: ${(props) => (props.$applyBackground ? "white" : "transparent")};
`;

// ScrollableDiv wraps Scrollable and re-uses $applyBackground in its own template.
// Without explicit type param, it inherits the prop from the base component.
export const ScrollableDiv = styled(Scrollable)`
  overflow: hidden;
  border: ${(props) => (props.$applyBackground ? "1px solid gray" : "none")};
`;

export function App() {
  return (
    <div style={{ display: "flex", gap: 16 }}>
      <Scrollable $applyBackground>With Background</Scrollable>
      <Scrollable>Without Background</Scrollable>
      <ScrollableDiv $applyBackground>Div With BG</ScrollableDiv>
      <ScrollableDiv>Div Without BG</ScrollableDiv>
    </div>
  );
}

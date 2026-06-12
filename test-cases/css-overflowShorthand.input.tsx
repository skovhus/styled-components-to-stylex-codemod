// Two-value overflow shorthand expansion to overflowX/overflowY longhands
import styled from "styled-components";

// Single-value shorthand: should stay as overflow
const Clipped = styled.div`
  overflow: hidden;
  background-color: lightblue;
  padding: 8px;
  width: 120px;
  height: 60px;
`;

// Two-value shorthand: should expand to overflowX/overflowY
const Split = styled.div`
  overflow: hidden auto;
  background-color: lightyellow;
  padding: 8px;
  width: 120px;
  height: 60px;
`;

export const App = () => (
  <div style={{ display: "flex", gap: 8, padding: 16 }}>
    <Clipped>Single-value overflow hidden with long content that overflows</Clipped>
    <Split>Two-value overflow hidden auto with long content that overflows</Split>
  </div>
);

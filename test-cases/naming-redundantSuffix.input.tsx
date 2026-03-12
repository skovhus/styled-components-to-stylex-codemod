// Dynamic style key always concatenates full suffix to avoid collisions
import * as React from "react";
import styled from "styled-components";

const MyBorder = styled.div<{ $borderWidth: number }>`
  border-width: ${(props) => props.$borderWidth}px;
  border-style: solid;
  border-color: black;
`;

export function App() {
  return (
    <div style={{ padding: "16px" }}>
      <MyBorder $borderWidth={2}>Bordered box</MyBorder>
    </div>
  );
}

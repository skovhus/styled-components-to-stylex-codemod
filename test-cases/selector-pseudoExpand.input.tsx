// Pseudo-expand: merged pseudo style object with conditional hover wrapping
import * as React from "react";
import styled from "styled-components";
import { highlightExpand } from "./lib/helpers";

const Button = styled.button`
  padding: 8px 16px;
  background-color: #f0f0f0;
  color: #333;

  &:${highlightExpand} {
    background-color: #e0e0e0;
    color: #111;
  }
`;

export function App() {
  return (
    <div style={{ display: "flex", gap: 16, padding: 16 }}>
      <Button>Default</Button>
      <Button>Hover me</Button>
    </div>
  );
}

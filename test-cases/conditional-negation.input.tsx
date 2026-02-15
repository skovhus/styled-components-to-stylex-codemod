import * as React from "react";
import styled from "styled-components";

// Support negated boolean conditions in ternary CSS blocks.
// Pattern: !props.$prop ? "css;" : ""

export const Tooltip = styled.div<{ $open?: boolean }>`
  ${(props) => (!props.$open ? "pointer-events: none; opacity: 0.1;" : "")}
`;

// Pattern: !props.$prop ? "cssA;" : "cssB;" (both branches have styles)
export const Overlay = styled.div<{ $visible?: boolean }>`
  inset: 0;
  ${(props) => (!props.$visible ? "opacity: 0;" : "opacity: 1;")}
`;

export const App = () => (
  <div>
    <Tooltip $open>Visible tooltip</Tooltip>
    <Tooltip $open={false}>Hidden tooltip</Tooltip>
    <Tooltip>Default hidden tooltip</Tooltip>
    <Overlay $visible>Visible overlay</Overlay>
    <Overlay $visible={false}>Hidden overlay</Overlay>
  </div>
);

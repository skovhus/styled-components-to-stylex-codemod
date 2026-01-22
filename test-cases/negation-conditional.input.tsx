import * as React from "react";
import styled from "styled-components";

// Support negated boolean conditions in ternary CSS blocks.
// Pattern: !props.$prop ? "css;" : ""

export const Tooltip = styled.div<{ $open?: boolean }>`
  position: absolute;
  ${(props) => (!props.$open ? "pointer-events: none; opacity: 0;" : "")}
`;

export const App = () => (
  <div>
    <Tooltip $open>Visible tooltip</Tooltip>
    <Tooltip $open={false}>Hidden tooltip</Tooltip>
    <Tooltip>Default hidden tooltip</Tooltip>
  </div>
);

import * as React from "react";
import styled from "styled-components";

// Support ternary CSS blocks that return declaration text (or empty string).

export const Highlight = styled.span<{ $dim: boolean }>`
  font-weight: var(--font-weight-medium);
  ${(props) => (props.$dim ? "opacity: 0.5;" : "")}
`;

export const App = () => (
  <div>
    <Highlight $dim>Dim</Highlight>
    <Highlight $dim={false}>No dim</Highlight>
  </div>
);

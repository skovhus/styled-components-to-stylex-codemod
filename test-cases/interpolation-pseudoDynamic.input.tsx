import styled from "styled-components";
import { highlight } from "./lib/helpers";

/**
 * Interpolated pseudo with dynamic interpolation inside the pseudo block.
 * `&:${highlight}` pseudo alias wraps a prop-conditional interpolation
 * that generates entire CSS declarations.
 */
const Button = styled.button<{ $active?: boolean }>`
  color: blue;
  padding: 8px 16px;

  &:${highlight} {
    ${(props) => props.$active && `background-color: red;`}
  }
`;

export const App = () => (
  <div style={{ display: "flex", gap: "16px", padding: "16px" }}>
    <Button $active>Active</Button>
    <Button>Inactive</Button>
  </div>
);

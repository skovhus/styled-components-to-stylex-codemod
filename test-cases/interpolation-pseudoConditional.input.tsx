import styled from "styled-components";
import { highlight } from "./lib/helpers";

/**
 * Interpolated pseudo-class selector using a runtime variable.
 * `&:${highlight}` expands to `:active` and `:hover` pseudo style objects.
 * The adapter resolves this to a `pseudoAlias` result (simple case, no
 * `styleSelectorExpr`), so all pseudo styles are applied directly.
 */
const Button = styled.button`
  color: blue;
  padding: 8px 16px;

  &:${highlight} {
    color: red;
    background-color: yellow;
  }
`;

export const App = () => <Button>Highlight Button</Button>;

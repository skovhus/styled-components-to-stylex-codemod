import styled from "styled-components";
import { highlight } from "./lib/helpers";

/**
 * Interpolated pseudo-class selector using a runtime variable.
 * `&:${highlight}` picks between `:hover` and `:active` based on device capability.
 * The adapter resolves this to a `pseudoConditional` result, generating two style
 * objects (one per pseudo) with a JS ternary in `stylex.props(...)`.
 */
const Button = styled.button`
  color: blue;
  padding: 8px 16px;

  &:${highlight} {
    color: red;
    background-color: yellow;
  }
`;

export const App = () => (
  <div style={{ display: "flex", gap: 16, padding: 16 }}>
    <Button>Highlight Button</Button>
  </div>
);

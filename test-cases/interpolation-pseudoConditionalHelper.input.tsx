import styled from "styled-components";
import { highlightWithHelper } from "./lib/helpers";
import { TouchDeviceToggle } from "./lib/TouchDeviceToggle";

/**
 * Interpolated pseudo-class selector with a helper function wrapper.
 * Same as `pseudoConditional`, but the adapter specifies a `helperFunction`
 * so the codemod emits `highlightStyles({ active: ..., hover: ... })`
 * instead of a raw ternary — enabling lint enforcement of style consistency.
 */
const Card = styled.div`
  color: blue;
  padding: 16px;

  &:${highlightWithHelper} {
    color: red;
    background-color: yellow;
  }
`;

export const App = () => <TouchDeviceToggle>{() => <Card>Helper Card</Card>}</TouchDeviceToggle>;

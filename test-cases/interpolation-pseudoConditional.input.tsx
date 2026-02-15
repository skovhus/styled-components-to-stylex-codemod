import styled from "styled-components";
import { highlight } from "./lib/helpers";
import { TouchDeviceToggle } from "./lib/TouchDeviceToggle";

/**
 * Interpolated pseudo-class selector using a runtime variable.
 * `&:${highlight}` expands to `:active` and `:hover` pseudo style objects,
 * wrapped in `highlightStyles({ active: ..., hover: ... })` for runtime selection.
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
  <TouchDeviceToggle>{() => <Button>Highlight Button</Button>}</TouchDeviceToggle>
);

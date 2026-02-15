import styled from "styled-components";
import { highlight } from "./lib/helpers";
import { TouchDeviceToggle } from "./lib/TouchDeviceToggle";

/**
 * Interpolated pseudo-class selector with a `styleSelectorExpr` wrapper.
 * The adapter specifies `styleSelectorExpr: "highlightStyles"` so the codemod
 * emits `highlightStyles({ active: ..., hover: ... })` for runtime selection.
 */
const Card = styled.div`
  color: blue;
  padding: 16px;

  &:${highlight} {
    color: red;
    background-color: yellow;
  }
`;

export const App = () => <TouchDeviceToggle>{() => <Card>Helper Card</Card>}</TouchDeviceToggle>;

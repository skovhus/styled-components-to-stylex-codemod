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

/**
 * Same as Button but with `&&:${highlight}` specificity hack.
 * The `&&` should be stripped and the pseudo alias still applied.
 */
const SpecificButton = styled.button`
  color: green;
  padding: 8px 16px;

  &&:${highlight} {
    color: purple;
    background-color: orange;
  }
`;

export const App = () => (
  <TouchDeviceToggle>
    {() => (
      <div style={{ display: "flex", gap: "16px", padding: "16px" }}>
        <Button>Highlight Button</Button>
        <SpecificButton>Specific Button</SpecificButton>
      </div>
    )}
  </TouchDeviceToggle>
);

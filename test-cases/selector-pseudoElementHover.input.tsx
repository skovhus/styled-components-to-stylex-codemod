// Hover styles nested inside a pseudo-element selector, using theme helper calls
// The color() calls go through the adapter's resolveCall hook
import styled from "styled-components";
import { color } from "./lib/helpers";

const RangeInput = styled.input`
  -webkit-appearance: none;
  width: 200px;
  height: 4px;
  background-color: ${color("bgBorderSolid")};
  border-radius: 2px;
  outline: none;

  &::-webkit-slider-thumb {
    -webkit-appearance: none;
    width: 16px;
    height: 16px;
    border-radius: 50%;
    background-color: ${color("controlPrimary")};
    cursor: pointer;
    transition: background-color 0.2s ease-in-out;

    &:hover {
      transition-duration: 0s;
      background-color: ${color("controlPrimaryHover")};
    }
  }
`;

export const App = () => (
  <div style={{ display: "flex", flexDirection: "column", gap: "16px", padding: "16px" }}>
    <label>
      Hover the thumb — it should change color:
      <RangeInput type="range" min="0" max="100" defaultValue="50" />
    </label>
  </div>
);

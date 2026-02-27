// Hover styles nested inside a pseudo-element selector
import styled from "styled-components";

const RangeInput = styled.input`
  -webkit-appearance: none;
  width: 200px;
  height: 4px;
  background-color: #ccc;
  border-radius: 2px;
  outline: none;

  &::-webkit-slider-thumb {
    -webkit-appearance: none;
    width: 16px;
    height: 16px;
    border-radius: 50%;
    background-color: #bf4f74;
    cursor: pointer;
    transition: background-color 0.2s ease-in-out;

    &:hover {
      transition-duration: 0s;
      background-color: #ff6b9d;
    }
  }
`;

export const App = () => (
  <div style={{ display: "flex", flexDirection: "column", gap: "16px", padding: "16px" }}>
    <RangeInput type="range" min="0" max="100" defaultValue="50" />
  </div>
);

import styled from "styled-components";

// Pattern: styled("input") needs HTML input attributes (max, min, type, etc.)
// The generated type must extend React.InputHTMLAttributes<HTMLInputElement>

/**
 * A range input component.
 * Should accept all HTML input attributes like max, min, type, value, onChange, etc.
 */
export const RangeInput = styled("input")`
  display: block;
  width: 300px;
  height: 6px;
  border-radius: 99999px;
  appearance: none;
`;

// Usage should work with HTML input attributes
export const App = () => (
  <div>
    <RangeInput type="range" max={100} min={0} />
    <RangeInput type="text" placeholder="Enter text" />
  </div>
);

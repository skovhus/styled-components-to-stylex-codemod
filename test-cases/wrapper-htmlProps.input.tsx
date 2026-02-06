import * as React from "react";
import styled from "styled-components";

// When a styled component wrapper spreads ...rest to the element,
// the wrapper type should include HTML element props like title, onClick, etc.

const OptionLabel = styled.label<{ $disabled?: boolean }>`
  display: flex;
  align-items: center;
  gap: 4px;
  opacity: ${(props) => (props.$disabled ? 0.5 : 1)};
`;

export const App = () => (
  <div>
    {/* title and onClick should be valid props */}
    <OptionLabel title="This is a tooltip" $disabled={false} onClick={() => console.log("clicked")}>
      <input type="checkbox" />
      Option 1
    </OptionLabel>
    <OptionLabel $disabled={true} title="Disabled option">
      <input type="checkbox" disabled />
      Option 2
    </OptionLabel>
  </div>
);

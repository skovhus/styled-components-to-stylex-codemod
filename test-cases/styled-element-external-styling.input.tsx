import * as React from "react";
import styled from "styled-components";

// When styled("element")<Props> is used with shouldSupportExternalStyling,
// the generated wrapper type should include className and style props
// so that external code can pass them through

export type Size = "tiny" | "small" | "normal";

export type Props = {
  color?: string;
  hollow?: boolean;
  size?: Size;
};

export const ColorBadge = styled("span")<Props>`
  display: inline-block;
  flex-shrink: 0;
  width: 12px;
  height: 12px;
  border-radius: 50%;
`;

// Usage: ColorBadge should accept className from external code
export const App = () => (
  <div>
    <ColorBadge color="red" className="custom-class">
      Badge
    </ColorBadge>
  </div>
);

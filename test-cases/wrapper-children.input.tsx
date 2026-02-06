import * as React from "react";
import styled from "styled-components";

// Pattern: styled(Component) wrapping a component that accepts children
// The wrapper must preserve the children prop from the wrapped component

interface BaseDividerProps {
  /** The divider text */
  text: string;
}

/** A divider component that accepts children */
function BaseDivider(props: React.PropsWithChildren<BaseDividerProps>) {
  const { text, children } = props;
  return (
    <div>
      <span>{text}</span>
      {children}
    </div>
  );
}

/** Styled wrapper - should still accept children */
export const StyledDivider = styled(BaseDivider)`
  padding-left: 20px;
`;

// Usage: children should work
export const App = () => (
  <StyledDivider text="Section">
    <span>Extra content</span>
  </StyledDivider>
);

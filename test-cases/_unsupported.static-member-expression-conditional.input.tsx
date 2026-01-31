// @expected-warning: Unsupported interpolation: member expression
// Conditional assignment is unsafe - the value may not be set at runtime
import React from "react";
import styled from "styled-components";

export const Divider = (props: { style?: React.CSSProperties }) => {
  return <DividerContainer role="separator" style={props.style} />;
};

// This assignment is inside a condition, so it's not guaranteed to execute
if (process.env.NODE_ENV === "development") {
  Divider.HEIGHT = 10;
}

const DividerContainer = styled.div`
  padding: 5px 0;
  height: ${Divider.HEIGHT}px;
`;

export function App() {
  return <Divider />;
}

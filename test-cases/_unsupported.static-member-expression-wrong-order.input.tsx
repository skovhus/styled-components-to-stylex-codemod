// @expected-warning: Unsupported interpolation: member expression
// Assignment after styled template is unsafe - the runtime value would be undefined
import React from "react";
import styled from "styled-components";

// The styled template references Divider.HEIGHT before it's assigned
const DividerContainer = styled.div`
  padding: 5px 0;
  height: ${Divider.HEIGHT}px;
`;

export const Divider = (props: { style?: React.CSSProperties }) => {
  return <DividerContainer role="separator" style={props.style} />;
};

// This assignment comes AFTER the styled template, so at runtime
// Divider.HEIGHT would be undefined when the template is evaluated
Divider.HEIGHT = 10;

export function App() {
  return <Divider />;
}

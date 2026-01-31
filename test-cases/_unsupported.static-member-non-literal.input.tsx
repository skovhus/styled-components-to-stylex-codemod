// @expected-warning: Unsupported interpolation: member expression
import React from "react";
import styled from "styled-components";

// Static property values that are not literals cannot be resolved at transform time.
// The codemod should bail when encountering member expressions whose values
// cannot be statically determined.

const getHeight = () => 10;

export const Divider = (props: { style?: React.CSSProperties }) => {
  return <DividerContainer role="separator" style={props.style} />;
};

// Non-literal value - cannot be resolved statically
Divider.HEIGHT = getHeight();

const DividerContainer = styled.div`
  padding: 5px 0;
  height: ${Divider.HEIGHT}px;
`;

export function App() {
  return <Divider />;
}

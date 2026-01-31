import React from "react";
import styled from "styled-components";

export const Divider = (props: { style?: React.CSSProperties }) => {
  return <DividerContainer role="separator" style={props.style} />;
};

Divider.HEIGHT = 10;

const DividerContainer = styled.div`
  padding: 5px 0;
  height: ${Divider.HEIGHT}px;
`;

export function App() {
  return <Divider />;
}

import React from "react";
import styled from "styled-components";

export const Divider = (props: { style?: React.CSSProperties }) => {
  return <DividerContainer role="separator" style={props.style} />;
};

// Multiple static properties on the same component
Divider.HEIGHT = 10;
Divider.WIDTH = 200;
Divider.BG_COLOR = "#e0e0e0";

const DividerContainer = styled.div`
  padding: 5px 0;
  height: ${Divider.HEIGHT}px;
  width: ${Divider.WIDTH}px;
  background-color: ${Divider.BG_COLOR};
`;

export function App() {
  return <Divider />;
}

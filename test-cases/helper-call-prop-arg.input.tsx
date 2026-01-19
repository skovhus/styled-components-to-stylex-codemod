import * as React from "react";
import styled from "styled-components";

// Support helper calls that depend on a prop value:
//   box-shadow: ${(props) => shadow(props.shadow)};

export function shadow(value: string): string {
  return `10px 10px 10px ${value}`;
}

export const Box = styled.div<{ shadow: string }>`
  box-shadow: ${(props) => shadow(props.shadow)};
  height: 50px;
  width: 50px;
`;

export const App = () => <Box shadow="rgba(0,0,0,0.2)" />;

// @expected-warning: Unsupported interpolation: member expression
// Static member expressions on IMPORTED components cannot be transformed
// because StyleX can't evaluate values from other modules at compile time.
import React from "react";
import styled from "styled-components";
import { Divider } from "./lib/divider";

// This assignment is on an imported component - StyleX can't resolve it
Divider.HEIGHT = 10;

const DividerContainer = styled.div`
  padding: 5px 0;
  height: ${Divider.HEIGHT}px;
`;

export function App() {
  return <DividerContainer />;
}

// Importing values directly from a .stylex file should be preserved as-is
import React from "react";
import styled from "styled-components";
import { $zIndex } from "./tokens.stylex";

const Container = styled.div`
  border-radius: 8px;
  padding: 6px;
  position: fixed;
  z-index: ${$zIndex.modal};
`;

export function App() {
  return <Container>StyleX Direct Import</Container>;
}

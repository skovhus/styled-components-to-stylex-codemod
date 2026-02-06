import React from "react";
import styled from "styled-components";
import { zIndex } from "./lib/helpers";

const PEEK_MAX_WIDTH = 380;

const Container = styled.div`
  border-radius: 8px;
  padding: 6px;
  max-width: ${PEEK_MAX_WIDTH}px;
  position: fixed;
  z-index: ${zIndex.modal};
`;

export function App() {
  return <Container />;
}

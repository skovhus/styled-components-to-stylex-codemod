import React from "react";
import styled from "styled-components";
import { zIndex } from "./lib/helpers";
import { PageSizeConstants } from "./lib/pageSizes.stylex";

const PEEK_MAX_WIDTH = 380;

const Container = styled.div`
  background-color: #eef2ff;
  border: 1px solid #4f46e5;
  border-radius: 8px;
  padding: 6px;
  max-width: ${PEEK_MAX_WIDTH}px;
  min-height: ${PageSizeConstants.listInitiativeRowHeight}px;
  position: fixed;
  z-index: ${zIndex.modal};
`;

export function App() {
  return <Container>Fixed modal shell</Container>;
}

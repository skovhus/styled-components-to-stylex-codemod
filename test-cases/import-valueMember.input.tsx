import React from "react";
import styled from "styled-components";
import { zIndex } from "./lib/helpers";
import { CardSizeConstants, PageSizeConstants } from "./lib/pageSizes.stylex";
import { COLUMN_WIDTH } from "./lib/sizes";

const PEEK_MAX_WIDTH = 380;

const Container = styled.div`
  background-color: #eef2ff;
  border: 1px solid #4f46e5;
  border-radius: 8px;
  padding: 6px;
  max-width: ${PEEK_MAX_WIDTH}px;
  width: ${CardSizeConstants.cardWidth}px;
  min-height: ${PageSizeConstants.listInitiativeRowHeight}px;
  position: fixed;
  z-index: ${zIndex.modal};
`;

// COLUMN_WIDTH comes from a plain module: it must be inlined as a literal
// (and arithmetic on it constant-folded) since the StyleX compiler cannot
// resolve imported non-StyleX values. PEEK_MAX_WIDTH above is a local const,
// so it stays a same-file reference the compiler can evaluate.
const Column = styled.div`
  height: 40px;
  background-color: #ddd6fe;
  width: ${COLUMN_WIDTH}px;
  min-width: ${COLUMN_WIDTH * 2}px;
`;

export function App() {
  return (
    <div style={{ display: "flex", gap: 8 }}>
      <Container>Fixed modal shell</Container>
      <Column>Inlined width column</Column>
    </div>
  );
}

// Imported value used in a binary expression (e.g., zIndex.dialog + 1)
import React from "react";
import styled from "styled-components";
import { zIndex } from "./lib/helpers";

const DialogContainer = styled.div`
  z-index: ${zIndex.dialog + 1};
  padding: 16px;
  background-color: white;
`;

export function App() {
  return <DialogContainer>Dialog Content</DialogContainer>;
}

// Border shorthand from helper function call returning full border value
import React from "react";
import styled from "styled-components";
import { thinBorder } from "./lib/helpers";

const Container = styled.div`
  border: ${thinBorder("transparent")};
  padding: 8px 16px;
`;

export function App() {
  return <Container>Hello</Container>;
}

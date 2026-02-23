import React from "react";
import styled from "styled-components";
import { thinPixel, color } from "./lib/helpers";

/**
 * Compound border shorthand with two interpolations:
 * width from thinPixel(), style static, color from color() helper.
 */
const Container = styled.div`
  border-radius: 2px;
  padding: 2px 6px;
  border: ${thinPixel()} solid ${color("bgBorderFaint")};
  flex-shrink: 0;
`;

export function App() {
  return <Container>Hello</Container>;
}

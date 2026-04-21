// Denylisted multi-component shorthands (font, animation, transition, grid, …)
// can't be safely promoted, so all call sites for the affected component fall
// back to inline-style merging via mergedSx.
import styled from "styled-components";
import { Flex } from "./lib/inline-base-flex";

const Wrapper = styled.div`
  padding: 16px;
  background-color: #f0f5ff;
`;

export function App() {
  return (
    <Wrapper>
      <Flex gap={8} style={{ color: "white" }}>
        Sibling site is also held back by the denylisted entry below
      </Flex>
      <Flex gap={12} style={{ font: "12px/1.4 system-ui", color: "black" }}>
        font shorthand is denylisted
      </Flex>
    </Wrapper>
  );
}

// Dynamic consumed prop expressions should be resolved, not left as raw JSX attributes
import * as React from "react";
import styled from "styled-components";
import { Flex } from "./lib/inline-base-flex";

const Wrapper = styled.div`
  padding: 16px;
  background-color: #f0f5ff;
`;

export function App({ isCompact }: { isCompact: boolean }) {
  return (
    <Wrapper>
      <Flex column grow={1} align={isCompact ? "start" : "center"} gap={isCompact ? 8 : 16}>
        Content
      </Flex>
    </Wrapper>
  );
}

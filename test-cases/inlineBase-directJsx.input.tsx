// Direct JSX usage of imported component without styled() wrapper
import styled from "styled-components";
import { Flex } from "./lib/inline-base-flex";

const Wrapper = styled.div`
  padding: 16px;
  background-color: #f0f5ff;
`;

export function App() {
  return (
    <Wrapper>
      <Flex column gap={8} align="center">
        Hello
      </Flex>
      <Flex column gap={16} align="start">
        World
      </Flex>
    </Wrapper>
  );
}

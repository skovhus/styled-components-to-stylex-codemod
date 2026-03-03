// Single-key variants from partial call sites should merge into main styles object
import styled from "styled-components";
import { Flex } from "./lib/inline-base-flex";

const Wrapper = styled.div`
  padding: 16px;
  background-color: #f0f5ff;
`;

export function App() {
  return (
    <Wrapper>
      <Flex column gap={24} center>
        Content A
      </Flex>
      <Flex>Content B</Flex>
    </Wrapper>
  );
}

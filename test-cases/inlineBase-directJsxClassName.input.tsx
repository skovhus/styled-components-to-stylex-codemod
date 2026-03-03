// Direct JSX with className/style: resolution should bail to avoid clobbering
import styled from "styled-components";
import { Flex } from "./lib/inline-base-flex";

const Wrapper = styled.div`
  padding: 16px;
  background-color: #f0f5ff;
`;

export function App() {
  return (
    <Wrapper>
      <Flex column gap={8} className="u-margin">
        With className
      </Flex>
      <Flex column gap={16} style={{ color: "red" }}>
        With style
      </Flex>
    </Wrapper>
  );
}

// Direct JSX usage of imported component with inline style prop should promote to stylex.create
import styled from "styled-components";
import { Flex } from "./lib/inline-base-flex";

const Wrapper = styled.div`
  padding: 16px;
  background-color: #f0f5ff;
`;

export function App() {
  return (
    <Wrapper>
      <Flex
        gap={24}
        style={{ padding: "20px 0", alignItems: "flex-start", minWidth: 0, width: "100%" }}
      >
        Promote me
      </Flex>
      <Flex gap={8} style={{ minWidth: 0 }}>
        Also promote
      </Flex>
    </Wrapper>
  );
}

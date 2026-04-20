// When any inline style prop is outside the promotion allowlist, all call sites
// for that component fall back to inline-style merging via mergedSx.
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
        Recognized prop
      </Flex>
      <Flex gap={12} style={{ WebkitMaskImage: "none" }}>
        Vendor-prefixed prop is not on the allowlist
      </Flex>
    </Wrapper>
  );
}

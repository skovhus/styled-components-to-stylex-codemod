// Consumed variant props must appear in generated type alongside explicit generic props
import styled from "styled-components";
import { Flex } from "./lib/inline-base-flex";

const Header = styled(Flex)<{ isCompact?: boolean }>`
  padding: ${(props) => (props.isCompact ? "4px" : "16px")};
  background-color: #f0f5ff;
`;

export function App() {
  return (
    <div style={{ display: "grid", gap: 8 }}>
      <Header justify="center" gap={12}>
        <span>Centered with gap</span>
      </Header>
      <Header align="center" isCompact>
        <span>Aligned compact</span>
      </Header>
      <Header gap={8} align="center" justify="flex-start">
        <span>All three</span>
      </Header>
    </div>
  );
}

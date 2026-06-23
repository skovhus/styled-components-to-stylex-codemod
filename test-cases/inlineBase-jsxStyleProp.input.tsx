// Direct JSX usage of imported component with inline style prop should promote static values and preserve dynamic values.
// Covers directional shorthands (padding/margin), background, border, plain props, and dynamic values.
import styled from "styled-components";
import { Flex } from "./lib/inline-base-flex";

const Wrapper = styled.div`
  padding: 16px;
  background-color: #f0f5ff;
`;

export function App({ accentColor = "#bf4f74" }: { accentColor?: string } = {}) {
  return (
    <Wrapper
      style={{
        borderBottom: "none",
        // min height keeps schedule variants from resizing the modal
        minHeight: 200,
      }}
    >
      <Flex
        gap={24}
        style={{
          padding: "20px 0",
          alignItems: "flex-start",
          // min width keeps flex children from expanding the container
          minWidth: 0,
          width: "100%",
        }}
      >
        Directional shorthand
      </Flex>
      <Flex gap={8} style={{ background: "#ffe0e0", border: "1px solid #b97" }}>
        Background and border shorthands
      </Flex>
      <Flex gap={12} style={{ margin: "8px 16px 4px 24px", paddingBlock: 4, paddingInline: 8 }}>
        Margin quad and explicit longhands
      </Flex>
      <Flex gap={16} style={{ color: accentColor, opacity: 0.5 }}>
        Dynamic color and opacity
      </Flex>
      <Flex gap={20} style={{ WebkitMaskImage: "none", color: "white" }}>
        Vendor-prefixed longhand still promotes
      </Flex>
      <Flex gap={28} style={{ background: "linear-gradient(to right, #f00, #00f)" }}>
        Single-function background still promotes
      </Flex>
    </Wrapper>
  );
}

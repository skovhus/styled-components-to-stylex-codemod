// Delegating polymorphic wrapper should use shared helper types when configured.
import * as React from "react";
import styled from "styled-components";

type FlexProps = {
  debugName?: string;
};

export const Flex = styled("div").withConfig({
  shouldForwardProp: (prop) => prop !== "debugName",
})<FlexProps>`
  display: flex;
  border: 1px solid #333;
  padding: 8px;
`;

export const Content = styled(Flex)`
  background-color: #d9f6ff;
`;

export const App = () => (
  <div style={{ display: "flex", flexDirection: "column", gap: 12, padding: 16 }}>
    <Content>Default content</Content>
    <Content
      as="input"
      onChange={(e) => console.log("Changed to " + e.target.value)}
      value="Hello"
    />
  </div>
);

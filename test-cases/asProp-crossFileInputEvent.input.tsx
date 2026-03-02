// Cross-file polymorphic wrapper should preserve `as` event typing.
import styled from "styled-components";
import { Flex } from "./lib/inline-base-flex";

const Content = styled(Flex)`
  background-color: cyan;
  padding: 8px;
  border: 1px solid #0aa;
`;

export const App = () => (
  <div style={{ display: "grid", gap: 8, padding: 12 }}>
    <Content>Default Div</Content>
    <Content
      as="input"
      onChange={(e) => console.log("Changed to " + e.target.value)}
      value="Hello"
    />
  </div>
);

// attrs that only set component props with no CSS template body
import styled from "styled-components";
import { Text } from "./lib/text";

const Title = styled(Text).attrs({ variant: "title2" })``;

export const App = () => (
  <div style={{ padding: "16px" }}>
    <Title>Hello World</Title>
  </div>
);

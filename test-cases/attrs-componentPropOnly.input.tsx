// attrs that only set component props with no CSS template body
import styled from "styled-components";
import { Flex } from "./lib/flex";
import { Text } from "./lib/text";

const Title = styled(Text).attrs({ variant: "title2" })``;

const ErrorContainer = styled(Flex).attrs({ column: true, gap: 16, align: "center" })`
  width: 100%;
  margin-top: 16px;
`;

export const App = () => (
  <div style={{ padding: "16px" }}>
    <Title>Hello World</Title>
    <ErrorContainer>
      <span>Something went wrong</span>
    </ErrorContainer>
  </div>
);

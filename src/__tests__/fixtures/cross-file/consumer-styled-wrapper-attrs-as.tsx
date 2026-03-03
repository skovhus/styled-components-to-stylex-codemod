import styled from "styled-components";
import { Flex } from "./lib/flex-component";

const StyledFlex = styled(Flex).attrs({ as: "span" })`
  gap: 8px;
  padding: 16px;
`;

export const App = () => (
  <div>
    <StyledFlex>Hello</StyledFlex>
  </div>
);

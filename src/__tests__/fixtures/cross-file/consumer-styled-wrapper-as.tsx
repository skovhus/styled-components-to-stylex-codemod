import styled from "styled-components";
import { Flex } from "./lib/flex-component";

const StyledFlex = styled(Flex)`
  gap: 8px;
  padding: 16px;
`;

export const App = () => (
  <div>
    <StyledFlex as="span">Hello</StyledFlex>
    <StyledFlex as={SomeComponent}>World</StyledFlex>
  </div>
);

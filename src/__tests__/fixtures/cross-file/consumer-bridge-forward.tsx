import styled from "styled-components";
import {
  CollapseArrowIcon,
  CollapseArrowIconGlobalSelector,
} from "./lib/converted-stylex-component";

const Container = styled.div`
  padding: 16px;

  &:hover ${CollapseArrowIconGlobalSelector} {
    background-color: rebeccapurple;
  }
`;

export const App = () => (
  <Container>
    <CollapseArrowIcon />
  </Container>
);

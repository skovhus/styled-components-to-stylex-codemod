import styled from "styled-components";
import {
  CollapseArrowIcon,
  CollapseArrowIconGlobalSelector as ArrowSel,
} from "./lib/converted-stylex-component";

const Container = styled.div`
  padding: 16px;

  &:hover ${ArrowSel} {
    background-color: rebeccapurple;
  }
`;

export const App = () => (
  <Container>
    <CollapseArrowIcon />
  </Container>
);

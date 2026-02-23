import styled from "styled-components";
import Icon, { CollapseArrowIconGlobalSelector } from "./lib/converted-default-export";

const Container = styled.div`
  padding: 16px;

  ${CollapseArrowIconGlobalSelector} {
    color: red;
  }
`;

export const App = () => (
  <Container>
    <Icon />
  </Container>
);

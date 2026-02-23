import styled from "styled-components";
import { CollapseArrowIcon } from "./lib/collapse-arrow-icon";

const highlight = "hover";

const Container = styled.div`
  padding: 16px;

  &:${highlight} ${CollapseArrowIcon} {
    display: block;
  }
`;

export const App = () => (
  <Container>
    <CollapseArrowIcon />
  </Container>
);

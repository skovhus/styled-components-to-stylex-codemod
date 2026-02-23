import styled from "styled-components";
import Util, {
  CollapseArrowIcon,
  CollapseArrowIconGlobalSelector,
} from "./lib/converted-default-plus-named";

const Container = styled.div`
  padding: 16px;

  ${CollapseArrowIconGlobalSelector} {
    color: red;
  }
`;

export const App = () => (
  <Container>
    <Util />
    <CollapseArrowIcon />
  </Container>
);

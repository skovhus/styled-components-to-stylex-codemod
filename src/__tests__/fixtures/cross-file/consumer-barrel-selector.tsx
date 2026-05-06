import styled from "styled-components";
import { CollapseArrowIcon } from "./lib/icon-barrel";

const Row = styled.div`
  ${CollapseArrowIcon} {
    width: 20px;
  }
`;

export const App = () => (
  <Row>
    <CollapseArrowIcon />
  </Row>
);

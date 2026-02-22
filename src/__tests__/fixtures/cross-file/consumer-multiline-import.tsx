import styled from "styled-components";
import { CollapseArrowIcon } from "./lib/collapse-arrow-icon";

export const Card = styled.div`
  padding: 16px;

  ${CollapseArrowIcon} {
    fill: blue;
  }
`;

export const App = () => (
  <Card>
    <CollapseArrowIcon />
  </Card>
);

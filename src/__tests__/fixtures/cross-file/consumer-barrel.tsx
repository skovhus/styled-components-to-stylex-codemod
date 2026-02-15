import styled from "styled-components";
import { CollapseArrowIcon } from "./lib";

const Card = styled.div`
  padding: 16px;
  border: 1px solid #ccc;

  ${CollapseArrowIcon} {
    fill: blue;
  }
`;

export const App = () => (
  <Card>
    <CollapseArrowIcon />
  </Card>
);

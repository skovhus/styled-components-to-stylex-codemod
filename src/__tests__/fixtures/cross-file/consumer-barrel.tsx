import styled from "styled-components";
import { CollapseArrowIcon, PlainIcon } from "./lib";

const Card = styled.div`
  padding: 16px;
  border: 1px solid #ccc;

  ${CollapseArrowIcon} {
    fill: blue;
  }

  ${PlainIcon} {
    fill: green;
  }
`;

export const App = () => (
  <Card>
    <CollapseArrowIcon />
    <PlainIcon />
  </Card>
);

import styled from "styled-components";
import { CollapseArrowIcon as Arrow } from "./lib/collapse-arrow-icon";

const Card = styled.div`
  padding: 16px;

  ${Arrow} {
    fill: blue;
  }
`;

export const App = () => (
  <Card>
    <Arrow />
  </Card>
);

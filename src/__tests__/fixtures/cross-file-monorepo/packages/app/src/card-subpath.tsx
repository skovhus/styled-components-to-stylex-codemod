import styled from "styled-components";
import { CollapseArrowIcon } from "@myorg/icons/collapse-arrow-icon";

const Card = styled.div`
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

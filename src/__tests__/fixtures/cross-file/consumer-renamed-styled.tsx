import styledComponents from "styled-components";
import { CollapseArrowIcon } from "./lib/collapse-arrow-icon";

// styled-components imported under a different name
const Card = styledComponents.div`
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

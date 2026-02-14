import styled from "styled-components";
import { CollapseArrowIcon } from "./lib/collapse-arrow-icon";

// Two different parents both style the same cross-file child
const ButtonA = styled.button`
  ${CollapseArrowIcon} {
    fill: red;
  }
`;

const ButtonB = styled.button`
  ${CollapseArrowIcon} {
    fill: blue;
  }
`;

export const App = () => (
  <div>
    <ButtonA>
      <CollapseArrowIcon />
    </ButtonA>
    <ButtonB>
      <CollapseArrowIcon />
    </ButtonB>
  </div>
);

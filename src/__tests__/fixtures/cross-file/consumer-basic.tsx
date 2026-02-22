import styled from "styled-components";
import { CollapseArrowIcon } from "./lib/collapse-arrow-icon";

const Button = styled.button`
  display: inline-flex;
  align-items: center;
  padding: 8px 12px;
`;

const StyledCollapseButton = styled(Button)`
  gap: 8px;

  ${
    // @ts-expect-error — styled-components TS types don't support non-styled components as CSS selectors, but it works at runtime
    CollapseArrowIcon
  } {
    width: 18px;
    height: auto;
    transition: transform 0.2s;
  }

  &:hover ${CollapseArrowIcon} {
    transform: rotate(180deg);
  }
`;

export const App = () => (
  <div>
    <StyledCollapseButton>
      <CollapseArrowIcon />
      Toggle
    </StyledCollapseButton>
  </div>
);

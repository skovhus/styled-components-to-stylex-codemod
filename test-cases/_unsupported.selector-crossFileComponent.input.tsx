// @expected-warning: Unsupported selector: unknown component selector
import styled from "styled-components";
import { CollapseArrowIcon } from "./lib/collapse-arrow-icon";

// Simulate a Button component
const Button = styled.button`
  display: inline-flex;
  align-items: center;
  padding: 8px 12px;
  background: #f0f0f0;
  border: 1px solid #ccc;
  border-radius: 4px;
  cursor: pointer;
`;

// This styled component uses the imported CollapseArrowIcon as a CSS selector
// After the icon is converted to StyleX, this pattern breaks
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
    <CollapseArrowIcon />
    <StyledCollapseButton>
      <CollapseArrowIcon />
      Toggle
    </StyledCollapseButton>
  </div>
);

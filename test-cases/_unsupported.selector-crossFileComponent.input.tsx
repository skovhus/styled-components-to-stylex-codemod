// @expected-warning: Unsupported selector: unknown component selector
// Bug: When a component is converted to StyleX in its own file, it can no longer be used
// as a CSS selector `${Component} { ... }` in styled-components template literals in other files.
// This produces TS2345: Argument of type '(props: ...) => Element' is not assignable to parameter of type 'Interpolation<...>'
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

  ${CollapseArrowIcon} {
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

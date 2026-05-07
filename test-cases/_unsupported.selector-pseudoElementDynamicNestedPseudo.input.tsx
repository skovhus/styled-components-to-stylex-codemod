// @expected-warning: Unsupported selector: pseudo-class on pseudo-element selector
//
// This is a parent-state pseudo-element case: styled-components emits `.button:hover::after`, where
// hovering the parent changes the pseudo-element. The old codemod shape nested the pseudo-class
// inside the pseudo-element object, which StyleX compiles like `::after:hover`; Storybook default
// screenshots matched, but a hover-state Playwright check showed the StyleX output never updated.
// Bail until the codemod can encode parent-state styling of pseudo-elements without changing the
// selector meaning.
import styled from "styled-components";

const Button = styled.button<{ $glowColor: string }>`
  position: relative;
  padding: 8px 16px;
  background-color: #333;
  color: white;

  &::after {
    content: "";
    display: block;
    height: 3px;
    opacity: 0;
  }

  &:hover::after {
    opacity: 1;
    background-color: ${(props) => props.$glowColor};
  }
`;

export const App = () => <Button $glowColor="rgba(0,128,255,0.3)">Hover me</Button>;

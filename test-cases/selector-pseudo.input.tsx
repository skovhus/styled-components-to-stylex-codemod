import styled from "styled-components";
import { zIndex } from "./lib/helpers";

const Thing = styled.div`
  border-right: 1px solid hotpink;
  color: blue;

  &:hover {
    color: red;
  }

  &:focus {
    outline: 2px solid blue;
  }

  &::before {
    content: "🔥";
  }

  &::after {
    content: attr(data-label);
  }
`;

const FocusableCell = styled.div<{ $isAnimating?: boolean }>`
  position: relative;
  z-index: ${(props) => (props.$isAnimating ? zIndex.modal : undefined)};

  &:focus-within {
    z-index: ${zIndex.modal + 2};
  }
`;

export const App = () => (
  <div style={{ display: "grid", gap: 12 }}>
    <Thing data-label=" after">Hover me!</Thing>
    <FocusableCell $isAnimating>
      <button type="button">Focusable cell</button>
    </FocusableCell>
  </div>
);

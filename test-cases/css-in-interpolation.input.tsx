import React from "react";
import styled, { css } from "styled-components";

// Bug 3b: css helper used inside styled component interpolations
// should be transformed into conditional StyleX styles.
// The `css` import must be removed and the css`` blocks transformed.

export const Button = styled.button<{ $primary?: boolean }>`
  padding: 8px 16px;
  border-radius: 4px;

  ${(props) =>
    props.$primary
      ? css`
          background: blue;
          color: white;

          &:after {
            content: "";
            position: absolute;
            inset: 0 4px;
            background-color: hotpink;
            z-index: -1;
            border-radius: 6px;
          }
        `
      : css`
          background: ${props.theme.colors.bgBase};
          color: black;
        `}
`;

export function App() {
  return (
    <div>
      <Button>Normal</Button>
      <Button $primary>Primary</Button>
    </div>
  );
}

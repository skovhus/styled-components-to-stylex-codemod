import React from "react";
import styled, { css } from "styled-components";

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
          background: ${props.theme.color.bgBase};
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

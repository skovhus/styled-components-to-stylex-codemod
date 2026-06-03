// @expected-warning: Conditional `css` block: runtime pseudo-alias styles are not supported
import styled, { css } from "styled-components";
import { highlight } from "./lib/helpers";

const Icon = styled.span<{ $active?: boolean; $hoverColor: string }>`
  display: inline-flex;
  padding: 4px 8px;

  ${(props) =>
    props.$active &&
    css`
      &:${highlight} {
        color: ${(p) => p.$hoverColor};
      }
    `}
`;

export const App = () => (
  <Icon $active $hoverColor="#047857">
    Dynamic alias
  </Icon>
);

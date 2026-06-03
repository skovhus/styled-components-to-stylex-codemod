// @expected-warning: Conditional `css` block: runtime pseudo-alias styles are not supported
// Runtime pseudo-alias style values from destructured interpolation parameters should bail safely.
import styled, { css } from "styled-components";
import { highlight } from "./lib/helpers";

const DestructuredAliasIcon = styled.span<{ $active?: boolean; tone: string }>`
  display: inline-flex;
  padding: 4px 8px;
  color: #475569;

  ${(props) =>
    props.$active &&
    css<{ tone: string }>`
      &:${highlight} {
        color: ${({ tone }) => tone};
      }
    `}
`;

export const App = () => (
  <div style={{ display: "flex", gap: 8, padding: 16 }}>
    <DestructuredAliasIcon $active tone="#7c3aed">
      Destructured alias
    </DestructuredAliasIcon>
  </div>
);

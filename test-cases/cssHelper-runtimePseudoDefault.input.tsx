// Conditional css pseudo block with a runtime base value for the same property.
import styled, { css } from "styled-components";

const RuntimeBackground = styled.div<{ $active?: boolean; $background?: string }>`
  width: 80px;
  height: 40px;
  border: 1px solid #94a3b8;
  background-color: ${(props) => props.$background || "transparent"};

  ${(props) =>
    props.$active &&
    css`
      &:hover {
        background-color: ${props.theme.color.bgBorderSolid};
      }
    `}
`;

export const App = () => (
  <div style={{ display: "flex", gap: 8, padding: 16 }}>
    <RuntimeBackground />
  </div>
);

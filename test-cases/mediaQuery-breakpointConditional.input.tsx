// Media query with breakpoint value interpolation inside conditional css block
import styled, { css } from "styled-components";
import { screenSizeBreakPoints } from "./lib/helpers";

const Container = styled.div<{ $isCompact?: boolean }>`
  padding: 16px;
  max-width: 800px;
  background-color: #f5f5f5;

  ${(props) =>
    props.$isCompact &&
    css`
      @media (max-width: ${screenSizeBreakPoints.phone}px) {
        max-width: none;
        border-radius: 0;
      }
    `}
`;

export const App = () => (
  <div style={{ display: "flex", flexDirection: "column", gap: "8px", padding: "16px" }}>
    <Container>Default</Container>
    <Container $isCompact>Compact</Container>
  </div>
);

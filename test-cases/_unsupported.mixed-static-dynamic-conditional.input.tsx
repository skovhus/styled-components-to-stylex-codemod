// @expected-warning: Conditional `css` block: mixed static/dynamic values with non-theme expressions cannot be safely transformed
import styled, { css } from "styled-components";

// Mixed static/dynamic values in conditional css block
// The ternary uses props to determine values mixed with constants

const MAIN_PAGE_MARGIN = 24;

type Position = "fixed" | "relative";

interface ContainerProps {
  $sidebarCollapsed: boolean;
  $position?: Position;
}

const Container = styled.div<ContainerProps>`
  display: flex;
  justify-content: center;
  pointer-events: none;

  ${(props) =>
    props.$position === "fixed"
      ? css`
          position: absolute;
          bottom: 16px;
          left: ${props.$sidebarCollapsed ? 0 : MAIN_PAGE_MARGIN}px;
          right: ${props.$sidebarCollapsed ? 0 : MAIN_PAGE_MARGIN}px;
        `
      : ""}
`;

export const App = () => <Container $sidebarCollapsed={false} $position="fixed" />;

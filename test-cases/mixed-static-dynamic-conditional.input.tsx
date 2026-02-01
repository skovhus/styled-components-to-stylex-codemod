import styled, { css } from "styled-components";

// Mixed static/dynamic values in conditional css block
// The ternary uses props to determine values mixed with constants

const MAIN_PAGE_MARGIN = 24;

type Position = "fixed" | "relative";

interface ContainerProps {
  $sidebarCollapsed: boolean;
  $position?: Position;
}

const Wrapper = styled.div`
  position: relative;
  height: 80px;
  background: #f0f0f0;
  border: 1px solid #ccc;
`;

const Container = styled.div<ContainerProps>`
  display: flex;
  justify-content: center;
  align-items: center;
  background: paleturquoise;
  padding: 8px;

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

export const App = () => (
  <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
    <div>
      <div>Position fixed + sidebar expanded (24px margins):</div>
      <Wrapper>
        <Container $sidebarCollapsed={false} $position="fixed">
          Content
        </Container>
      </Wrapper>
    </div>
    <div>
      <div>Position fixed + sidebar collapsed (0px margins):</div>
      <Wrapper>
        <Container $sidebarCollapsed={true} $position="fixed">
          Content
        </Container>
      </Wrapper>
    </div>
    <div>
      <div>Position relative (no absolute positioning, normal flow):</div>
      <Wrapper>
        <Container $sidebarCollapsed={false} $position="relative">
          Content
        </Container>
      </Wrapper>
    </div>
  </div>
);

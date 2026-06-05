import * as React from "react";
import * as stylex from "@stylexjs/stylex";

// Mixed static/dynamic values in conditional css block
// The ternary uses props to determine values mixed with constants

const MAIN_PAGE_MARGIN = 24;

type Position = "fixed" | "relative";

interface ContainerProps {
  sidebarCollapsed: boolean;
  position?: Position;
}

function Wrapper({ children }: { children?: React.ReactNode }) {
  return <div sx={styles.wrapper}>{children}</div>;
}

function Container(props: React.PropsWithChildren<ContainerProps>) {
  const { children, sidebarCollapsed, position } = props;
  return (
    <div
      sx={[
        styles.container,
        position === "fixed" && styles.containerPositionFixed,
        position === "fixed" && sidebarCollapsed
          ? styles.containerPositionFixedSidebarCollapsed
          : undefined,
      ]}
    >
      {children}
    </div>
  );
}

export const App = () => (
  <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
    <div>
      <div>Position fixed + sidebar expanded (24px margins):</div>
      <Wrapper>
        <Container sidebarCollapsed={false} position="fixed">
          Content
        </Container>
      </Wrapper>
    </div>
    <div>
      <div>Position fixed + sidebar collapsed (0px margins):</div>
      <Wrapper>
        <Container sidebarCollapsed={true} position="fixed">
          Content
        </Container>
      </Wrapper>
    </div>
    <div>
      <div>Position relative (no absolute positioning, normal flow):</div>
      <Wrapper>
        <Container sidebarCollapsed={false} position="relative">
          Content
        </Container>
      </Wrapper>
    </div>
  </div>
);

const styles = stylex.create({
  wrapper: {
    position: "relative",
    height: 80,
    backgroundColor: "#f0f0f0",
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: "#ccc",
  },
  container: {
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "paleturquoise",
    padding: 8,
  },
  containerPositionFixed: {
    position: "absolute",
    bottom: 16,
    left: MAIN_PAGE_MARGIN,
    right: MAIN_PAGE_MARGIN,
  },
  containerPositionFixedSidebarCollapsed: {
    left: 0,
    right: 0,
  },
});

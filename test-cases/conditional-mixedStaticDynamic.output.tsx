import * as React from "react";
import * as stylex from "@stylexjs/stylex";

// Mixed static/dynamic values in conditional css block
// The ternary uses props to determine values mixed with constants

const MAIN_PAGE_MARGIN = 24;

type Position = "fixed" | "relative";

interface ContainerProps extends Omit<React.ComponentProps<"div">, "className" | "style"> {
  $sidebarCollapsed: boolean;
  $position?: Position;
}

function Container(props: ContainerProps) {
  const { children, $sidebarCollapsed, $position } = props;

  return (
    <div
      {...stylex.props(
        styles.container,
        $position === "fixed" && styles.containerPositionFixed,
        $position === "fixed" && $sidebarCollapsed
          ? styles.containerPositionFixedSidebarCollapsed
          : undefined,
      )}
    >
      {children}
    </div>
  );
}

export const App = () => (
  <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
    <div>
      <div>Position fixed + sidebar expanded (24px margins):</div>
      <div {...stylex.props(styles.wrapper)}>
        <Container $sidebarCollapsed={false} $position="fixed">
          Content
        </Container>
      </div>
    </div>
    <div>
      <div>Position fixed + sidebar collapsed (0px margins):</div>
      <div {...stylex.props(styles.wrapper)}>
        <Container $sidebarCollapsed={true} $position="fixed">
          Content
        </Container>
      </div>
    </div>
    <div>
      <div>Position relative (no absolute positioning, normal flow):</div>
      <div {...stylex.props(styles.wrapper)}>
        <Container $sidebarCollapsed={false} $position="relative">
          Content
        </Container>
      </div>
    </div>
  </div>
);

const styles = stylex.create({
  wrapper: {
    position: "relative",
    height: "80px",
    backgroundColor: "#f0f0f0",
    backgroundImage: "none",
    borderWidth: "1px",
    borderStyle: "solid",
    borderColor: "#ccc",
  },
  container: {
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "paleturquoise",
    backgroundImage: "none",
    padding: "8px",
  },
  containerPositionFixedSidebarCollapsed: {
    left: "0px",
    right: "0px",
  },
  containerPositionFixed: {
    position: "absolute",
    bottom: "16px",
    left: `${MAIN_PAGE_MARGIN}px`,
    right: `${MAIN_PAGE_MARGIN}px`,
  },
});

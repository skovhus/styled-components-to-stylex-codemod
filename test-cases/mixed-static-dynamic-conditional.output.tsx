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
        $position === "fixed" && $sidebarCollapsed && styles.containerPositionFixedSidebarCollapsed,
      )}
    >
      {children}
    </div>
  );
}

export const App = () => <Container $sidebarCollapsed={false} $position="fixed" />;

const styles = stylex.create({
  container: {
    display: "flex",
    justifyContent: "center",
    pointerEvents: "none",
  },
  containerPositionFixedSidebarCollapsed: {
    left: `${0}px`,
    right: `${0}px`,
  },
  containerPositionFixed: {
    position: "absolute",
    bottom: "16px",
    left: `${MAIN_PAGE_MARGIN}px`,
    right: `${MAIN_PAGE_MARGIN}px`,
  },
});

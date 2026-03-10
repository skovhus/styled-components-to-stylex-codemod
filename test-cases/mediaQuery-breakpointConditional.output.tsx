import * as React from "react";
import * as stylex from "@stylexjs/stylex";
import { breakpoints } from "./lib/breakpoints.stylex";

type ContainerProps = React.PropsWithChildren<{
  isCompact?: boolean;
}>;

function Container(props: ContainerProps) {
  const { children, isCompact } = props;

  return (
    <div sx={[styles.container, isCompact ? styles.containerCompact : undefined]}>{children}</div>
  );
}

export const App = () => (
  <div style={{ display: "flex", flexDirection: "column", gap: "8px", padding: "16px" }}>
    <Container>Default</Container>
    <Container isCompact>Compact</Container>
  </div>
);

const styles = stylex.create({
  container: {
    padding: "16px",
    maxWidth: "800px",
    backgroundColor: "#f5f5f5",
  },
  containerCompact: {
    maxWidth: {
      default: null,
      [breakpoints.phone]: "none",
    },
    borderRadius: {
      default: null,
      [breakpoints.phone]: 0,
    },
  },
});

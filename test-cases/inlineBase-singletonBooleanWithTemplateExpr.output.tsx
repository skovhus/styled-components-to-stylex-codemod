import * as React from "react";
import * as stylex from "@stylexjs/stylex";
import { mergedSx } from "./lib/mergedSx";

type ContainerProps = {
  isCompact?: boolean;
  column?: boolean;
} & React.ComponentProps<"div">;

export function Container(props: ContainerProps) {
  const { className, children, style, sx, column, isCompact, ...rest } = props;

  return (
    <div
      {...rest}
      {...mergedSx(
        [
          styles.container,
          column && styles.containerColumn,
          isCompact && styles.containerCompact,
          sx,
        ],
        className,
        style,
      )}
    >
      {children}
    </div>
  );
}

export function App() {
  return (
    <div style={{ display: "grid", gap: 8 }}>
      <Container column>Column with default padding</Container>
      <Container column isCompact>
        Column compact
      </Container>
    </div>
  );
}

const styles = stylex.create({
  container: {
    display: "flex",
    flexDirection: "row",
    padding: "16px",
    backgroundColor: "#f0f5ff",
  },
  containerCompact: {
    padding: "4px",
  },
  containerColumn: {
    flexDirection: "column",
  },
});

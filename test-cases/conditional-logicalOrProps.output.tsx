// Logical-OR condition: ($completed || $active) && css`...`.
// The codemod fails to convert the || test and bails the component entirely,
// rather than outputting ($active || $completed) ? styles.dotHighlighted : undefined.
import * as React from "react";
import * as stylex from "@stylexjs/stylex";

type DotProps = React.PropsWithChildren<{
  $active?: boolean;
  $completed?: boolean;
}>;

function Dot(props: DotProps) {
  const { children, $active, $completed } = props;

  return (
    <div
      {...stylex.props(styles.dot, $active || $completed ? styles.dotActiveOrCompleted : undefined)}
    >
      {children}
    </div>
  );
}

export function App() {
  return (
    <div style={{ display: "flex", gap: 16, padding: 20, alignItems: "center" }}>
      <Dot>neither</Dot>
      <Dot $active>active</Dot>
      <Dot $completed>completed</Dot>
      <Dot $active $completed>
        both
      </Dot>
    </div>
  );
}

const styles = stylex.create({
  dot: {
    width: "14px",
    height: "14px",
    borderRadius: "50%",
    borderWidth: "2px",
    borderStyle: "solid",
    borderColor: "#cbd5e1",
    backgroundColor: "white",
  },
  dotActiveOrCompleted: {
    borderColor: "#6366f1",
    backgroundColor: "#6366f1",
  },
});

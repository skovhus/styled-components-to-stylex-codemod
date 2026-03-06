import * as React from "react";
import * as stylex from "@stylexjs/stylex";

type ContainerProps = React.PropsWithChildren<{
  align?: keyof typeof containerAlignVariants;
}>;

function Container(props: ContainerProps) {
  const { children, align } = props;

  return (
    <div sx={[styles.container, align != null && containerAlignVariants[align]]}>{children}</div>
  );
}

export function App() {
  return (
    <div style={{ display: "grid", gap: 8 }}>
      <Container align="start">Start</Container>
      <Container align="center">Center</Container>
      <Container align="end">End</Container>
    </div>
  );
}

const styles = stylex.create({
  container: {
    display: "flex",
    flexDirection: "row",
    padding: "8px",
    backgroundColor: "#fff5f5",
    borderWidth: "1px",
    borderStyle: "solid",
    borderColor: "#b66",
  },
});

const containerAlignVariants = stylex.create({
  start: {
    alignItems: "start",
  },
  center: {
    alignItems: "center",
  },
  end: {
    alignItems: "end",
  },
});

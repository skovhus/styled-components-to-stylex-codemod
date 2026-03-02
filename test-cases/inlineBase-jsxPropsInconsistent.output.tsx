import * as React from "react";
import * as stylex from "@stylexjs/stylex";

type ContainerProps = {
  ref?: React.Ref<HTMLDivElement>;
  children?: React.ReactNode;
  align?: any;
};

function Container(props: ContainerProps) {
  const { children, align } = props;

  return (
    <div
      {...stylex.props(
        styles.container,
        align != null && containerAlignVariants[align as keyof typeof containerAlignVariants],
      )}
    >
      {children}
    </div>
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
    padding: "8px",
    backgroundColor: "#fff5f5",
    borderWidth: "1px",
    borderStyle: "solid",
    borderColor: "#b66",
  },
});

const containerAlignVariants = stylex.create({
  start: {
    alignItems: "flex-start",
  },
  center: {
    alignItems: "center",
  },
  end: {
    alignItems: "flex-end",
  },
});

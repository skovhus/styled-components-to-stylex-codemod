import * as React from "react";
import * as stylex from "@stylexjs/stylex";

type ContainerProps = React.PropsWithChildren<{
  gap?: keyof typeof containerGapVariants;
}>;

function Container(props: ContainerProps) {
  const { children, gap } = props;

  return (
    <div {...stylex.props(styles.container, gap != null && containerGapVariants[gap])}>
      {children}
    </div>
  );
}

export function App() {
  return (
    <div style={{ display: "grid", gap: 8 }}>
      <Container>Default gap</Container>
      <Container gap={8}>Gap 8</Container>
      <Container gap={16}>Gap 16</Container>
    </div>
  );
}

const styles = stylex.create({
  container: {
    display: "flex",
    flexDirection: "column",
    padding: "8px",
    backgroundColor: "#f0f5ff",
    borderWidth: "1px",
    borderStyle: "solid",
    borderColor: "#6a7ab5",
  },
});

const containerGapVariants = stylex.create({
  8: {
    gap: "8px",
  },
  16: {
    gap: "16px",
  },
});

import * as React from "react";
import * as stylex from "@stylexjs/stylex";

type ContainerProps = React.PropsWithChildren<{
  align?: keyof typeof containerAlignVariants;
  gap?: keyof typeof containerGapVariants;
}>;

function Container(props: ContainerProps) {
  const { children, align, gap } = props;
  return (
    <div
      sx={[
        styles.container,
        align != null && containerAlignVariants[align],
        gap != null && containerGapVariants[gap],
      ]}
    >
      {children}
    </div>
  );
}

export function App() {
  return (
    <div style={{ display: "grid", gap: 8 }}>
      <Container>Default</Container>
      <Container gap={8} align="start">
        Gap 8, start
      </Container>
      <Container gap={16} align="center">
        Gap 16, center
      </Container>
      <Container gap={8} align="end">
        Gap 8, end
      </Container>
    </div>
  );
}

const styles = stylex.create({
  container: {
    display: "flex",
    flexDirection: "column",
    padding: 8,
    backgroundColor: "#f0f5ff",
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: "#6a7ab5",
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

const containerGapVariants = stylex.create({
  8: {
    gap: "8px",
  },
  16: {
    gap: "16px",
  },
});

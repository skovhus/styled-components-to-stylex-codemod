import * as stylex from "@stylexjs/stylex";

export function App() {
  return (
    <div style={{ display: "grid", gap: 8 }}>
      <div {...stylex.props(styles.container)}>Default gap</div>
      <div {...stylex.props(styles.container, containerGapVariants["8"])}>Gap 8</div>
      <div {...stylex.props(styles.container, containerGapVariants["16"])}>Gap 16</div>
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
  "8": {
    gap: "8px",
  },
  "16": {
    gap: "16px",
  },
});

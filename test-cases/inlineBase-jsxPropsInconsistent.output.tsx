import * as stylex from "@stylexjs/stylex";

export function App() {
  return (
    <div style={{ display: "grid", gap: 8 }}>
      <div {...stylex.props(styles.container, containerAlignVariants["start"])}>Start</div>
      <div {...stylex.props(styles.container, containerAlignVariants["center"])}>Center</div>
      <div {...stylex.props(styles.container, containerAlignVariants["end"])}>End</div>
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

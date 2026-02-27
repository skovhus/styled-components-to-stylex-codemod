import * as stylex from "@stylexjs/stylex";

export function App() {
  return (
    <div {...stylex.props(styles.gridContainer)}>
      <div>Cell 1</div>
      <div>Cell 2</div>
    </div>
  );
}

const styles = stylex.create({
  gridContainer: {
    display: "grid",
    flexDirection: "column",
    gridTemplateColumns: "1fr 1fr",
    gap: "8px",
  },
});

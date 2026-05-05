import * as stylex from "@stylexjs/stylex";

export const App = () => (
  <div sx={styles.scrollPanel}>
    <div>Scrollable panel</div>
    <div>Second row</div>
  </div>
);

const styles = stylex.create({
  scrollPanel: {
    WebkitOverflowScrolling: "touch",
    overflowY: "auto",
    maxHeight: 96,
    padding: 8,
    backgroundColor: "#eef2ff",
  },
});

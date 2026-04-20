import * as stylex from "@stylexjs/stylex";

const ITEM_MIN_WIDTH_VAR = "--item-min-width";

export const App = () => (
  <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
    <div sx={styles.container}>Sets --item-min-width: 100%</div>
    <div sx={styles.consumer}>Reads var(--item-min-width)</div>
  </div>
);

const styles = stylex.create({
  container: {
    "--item-min-width": "100%",
    backgroundColor: "orange",
    color: "white",
    padding: 8,
  },
  consumer: {
    width: "var(--item-min-width)",
    backgroundColor: "teal",
    color: "white",
    padding: 8,
  },
});

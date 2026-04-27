import * as stylex from "@stylexjs/stylex";

export const App = () => (
  <div>
    <div sx={styles.container}>Container</div>
    <div sx={styles.grid}>Grid</div>
  </div>
);

const styles = stylex.create({
  container: {
    "--item-min-width": "100%",
    backgroundColor: "orange",
  },
  grid: {
    "--grid-min-width": "240px",
    backgroundColor: "rebeccapurple",
  },
});

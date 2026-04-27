import * as stylex from "@stylexjs/stylex";

export const App = () => (
  <div>
    <div sx={styles.container}>Container</div>
  </div>
);

const styles = stylex.create({
  container: {
    "--item-min-width": "100%",
    backgroundColor: "orange",
  },
});

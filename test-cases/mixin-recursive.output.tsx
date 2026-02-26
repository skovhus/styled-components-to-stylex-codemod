import * as stylex from "@stylexjs/stylex";

export const App = () => (
  <div {...stylex.props(styles.finalComponent, styles.middleStyles, styles.baseStyles)}>
    Recursive mixins
  </div>
);

const styles = stylex.create({
  finalComponent: {
    padding: "10px",
  },
  baseStyles: {
    color: "red",
  },
  middleStyles: {
    backgroundColor: "blue",
  },
});

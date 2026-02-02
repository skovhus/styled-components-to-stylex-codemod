import * as stylex from "@stylexjs/stylex";

export const App = () => (
  <div {...stylex.props(styles.baseStyles, styles.middleStyles, styles.finalComponent)}>
    Recursive mixins
  </div>
);

const styles = stylex.create({
  baseStyles: {
    color: "red",
  },
  middleStyles: {
    backgroundColor: "blue",
  },
  finalComponent: {
    padding: "10px",
  },
});

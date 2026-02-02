import * as stylex from "@stylexjs/stylex";

export const App = () => (
  <button {...stylex.props(styles.hoverStyles, styles.button)}>Hover me</button>
);

const styles = stylex.create({
  hoverStyles: {
    color: {
      default: null,
      ":hover": "blue",
    },
  },
  button: {
    color: "red",
  },
});

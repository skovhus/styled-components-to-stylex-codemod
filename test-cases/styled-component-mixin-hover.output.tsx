import * as stylex from "@stylexjs/stylex";

export const App = () => (
  <button {...stylex.props(styles.button, styles.hoverStyles)}>Hover me</button>
);

const styles = stylex.create({
  button: {
    color: "red",
  },
  hoverStyles: {
    color: {
      default: null,
      ":hover": "blue",
    },
  },
});

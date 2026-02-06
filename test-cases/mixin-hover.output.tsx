import * as stylex from "@stylexjs/stylex";

export const App = () => (
  <button {...stylex.props(styles.button, styles.hoverStylesInButton)}>Hover me</button>
);

const styles = stylex.create({
  button: {
    color: "red",
  },
  hoverStylesInButton: {
    color: {
      default: "red",
      ":hover": "blue",
    },
  },
});

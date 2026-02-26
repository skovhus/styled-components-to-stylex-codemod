import * as stylex from "@stylexjs/stylex";

export const App = () => (
  <div {...stylex.props(styles.container, styles.colorMixin, styles.backgroundMixin)}>
    Multiple mixins
  </div>
);

const styles = stylex.create({
  container: {
    padding: "10px",
  },
  colorMixin: {
    color: "red",
  },
  backgroundMixin: {
    backgroundColor: "blue",
  },
});

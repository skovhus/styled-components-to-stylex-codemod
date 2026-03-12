import * as stylex from "@stylexjs/stylex";

export const App = () => (
  <div sx={[styles.container, styles.colorMixin, styles.backgroundMixin]}>Multiple mixins</div>
);

const styles = stylex.create({
  container: {
    padding: 10,
  },
  colorMixin: {
    color: "red",
  },
  backgroundMixin: {
    backgroundColor: "blue",
  },
});

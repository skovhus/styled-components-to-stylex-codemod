import * as stylex from "@stylexjs/stylex";

export const App = () => (
  <div>
    <div sx={[styles.cssFirst, styles.cssMixin, styles.backgroundMixin]}>CSS first</div>
    <div sx={[styles.first, styles.backgroundMixin, styles.cssMixin]}>Styled first</div>
    <div sx={[styles.interleaved, styles.cssMixin, styles.backgroundMixin, styles.cssMixin2]}>
      Interleaved
    </div>
  </div>
);

const styles = stylex.create({
  // Test case 1: Color mixin first, then background mixin
  // Order should be: cssMixin, backgroundMixin, cssFirst
  cssFirst: {
    padding: 10,
  },
  cssMixin: {
    color: "red",
  },
  backgroundMixin: {
    backgroundColor: "blue",
  },
  // Test case 2: Background mixin first, then color mixin
  // Order should be: backgroundMixin, cssMixin, styledFirst
  first: {
    margin: 10,
  },
  interleaved: {
    padding: 5,
  },
  cssMixin2: {
    fontWeight: "bold",
  },
});

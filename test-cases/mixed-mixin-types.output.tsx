import * as stylex from "@stylexjs/stylex";

export const App = () => (
  <div>
    <div {...stylex.props(styles.cssMixin, styles.backgroundMixin, styles.cssFirst)}>CSS first</div>
    <div {...stylex.props(styles.backgroundMixin, styles.cssMixin, styles.styledFirst)}>
      Styled first
    </div>
    <div
      {...stylex.props(
        styles.cssMixin,
        styles.backgroundMixin,
        styles.cssMixin2,
        styles.interleaved,
      )}
    >
      Interleaved
    </div>
  </div>
);

const styles = stylex.create({
  // Test case 1: Color mixin first, then background mixin
  // Order should be: cssMixin, backgroundMixin, cssFirst
  cssFirst: {
    padding: "10px",
  },
  cssMixin: {
    color: "red",
  },
  backgroundMixin: {
    backgroundColor: "blue",
  },

  // Test case 2: Background mixin first, then color mixin
  // Order should be: backgroundMixin, cssMixin, styledFirst
  styledFirst: {
    margin: "10px",
  },
  interleaved: {
    padding: "5px",
  },
  cssMixin2: {
    fontWeight: "bold",
  },
});

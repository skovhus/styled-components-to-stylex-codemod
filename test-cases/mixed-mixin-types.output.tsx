import * as stylex from "@stylexjs/stylex";

export const App = () => (
  <div>
    <div {...stylex.props(styles.cssMixin, styles.styledMixin, styles.cssFirst)}>CSS first</div>
    <div {...stylex.props(styles.styledMixin, styles.cssMixin, styles.styledFirst)}>
      Styled first
    </div>
    <div
      {...stylex.props(styles.cssMixin, styles.styledMixin, styles.cssMixin2, styles.interleaved)}
    >
      Interleaved
    </div>
  </div>
);

const styles = stylex.create({
  // Styled component mixin
  styledMixin: {
    backgroundColor: "blue",
  },
  cssMixin: {
    color: "red",
  },

  // Test case 1: CSS helper first, then styled-component mixin
  // Order should be: cssMixin, styledMixin, combined
  cssFirst: {
    padding: "10px",
  },

  // Test case 2: Styled-component mixin first, then css helper
  // Order should be: styledMixin, cssMixin, combined2
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

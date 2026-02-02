import * as stylex from "@stylexjs/stylex";

export const App = () => (
  <div {...stylex.props(styles.hiddenOnMobile, styles.elementWithMixin)}>Red with mixin</div>
);

const styles = stylex.create({
  hiddenOnMobile: {
    display: {
      default: null,
      "@media (max-width: 767px)": "none",
    },
  },
  elementWithMixin: {
    color: "red",
  },
});

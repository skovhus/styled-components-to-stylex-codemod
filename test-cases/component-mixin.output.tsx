import * as stylex from "@stylexjs/stylex";

export const App = () => (
  <div>
    <div {...stylex.props(styles.hiddenOnMobile)}>Hidden on mobile (base)</div>
    <div {...stylex.props(styles.hiddenOnMobile, styles.elementWithMixin)}>Red with mixin</div>
    <div {...stylex.props(styles.hiddenOnMobile, styles.anotherMixedElement)}>Blue with mixin</div>
  </div>
);

const styles = stylex.create({
  // Base styled component that will be used as a mixin
  hiddenOnMobile: {
    display: {
      default: null,
      "@media (max-width: 767px)": "none",
    },
  },

  // Using another styled component's styles as a mixin
  elementWithMixin: {
    color: "red",
    padding: "16px",
  },
  anotherMixedElement: {
    backgroundColor: "blue",
    fontWeight: "bold",
  },
});

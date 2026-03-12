import * as stylex from "@stylexjs/stylex";

export const App = () => (
  <div>
    <div sx={styles.hiddenOnMobileMixin}>Hidden on mobile (base)</div>
    <div sx={[styles.elementWithMixin, styles.hiddenOnMobileMixin]}>Red with mixin</div>
    <div sx={[styles.elementWithMixinHover, styles.colorMixin]}>Red default, blue hover mixin</div>
    <div sx={[styles.anotherMixedElement, styles.hiddenOnMobileMixin]}>Blue with mixin</div>
  </div>
);

const styles = stylex.create({
  hiddenOnMobileMixin: {
    display: {
      default: null,
      "@media (max-width: 767px)": "none",
    },
  },
  colorMixin: {
    color: "red",
  },
  // Using shared mixins within components
  elementWithMixin: {
    color: "red",
    padding: 16,
  },
  elementWithMixinHover: {
    color: {
      default: "red",
      ":hover": "blue",
    },
  },
  anotherMixedElement: {
    backgroundColor: "blue",
    fontWeight: "bold",
  },
});

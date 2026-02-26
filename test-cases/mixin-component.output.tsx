import * as stylex from "@stylexjs/stylex";

export const App = () => (
  <div>
    <div {...stylex.props(styles.hiddenOnMobileMixin)}>Hidden on mobile (base)</div>
    <div {...stylex.props(styles.elementWithMixin, styles.hiddenOnMobileMixin)}>Red with mixin</div>
    <div {...stylex.props(styles.elementWithMixinHover, styles.colorMixin)}>
      Red default, blue hover mixin
    </div>
    <div {...stylex.props(styles.anotherMixedElement, styles.hiddenOnMobileMixin)}>
      Blue with mixin
    </div>
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
    padding: "16px",
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

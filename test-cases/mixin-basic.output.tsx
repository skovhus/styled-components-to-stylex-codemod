import * as stylex from "@stylexjs/stylex";

export const App = () => (
  <div>
    <div sx={[styles.elementWithMixin, styles.hiddenOnMobile]}>Red with mixin</div>
    <div sx={[styles.multiMixinContainer, styles.colorMixin, styles.backgroundMixin]}>
      Multiple mixins
    </div>
  </div>
);

const styles = stylex.create({
  elementWithMixin: {
    color: "red",
  },
  hiddenOnMobile: {
    display: {
      default: null,
      "@media (max-width: 767px)": "none",
    },
  },
  multiMixinContainer: {
    padding: 10,
  },
  colorMixin: {
    color: "red",
  },
  backgroundMixin: {
    backgroundColor: "blue",
  },
});

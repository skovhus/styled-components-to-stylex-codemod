import * as stylex from "@stylexjs/stylex";

export const App = () => (
  <div>
    <div data-open="true" sx={styles.collapsibleRegion}>
      <div>Open content</div>
    </div>
    <div sx={styles.supportsHoverOrder}>Hover order</div>
  </div>
);

const styles = stylex.create({
  collapsibleRegion: {
    overflow: "hidden",
    height: {
      default: 0,
      ':is([data-open="true"])': "auto",
      "@supports (interpolate-size: allow-keywords) and (height: calc-size(auto, size))": {
        default: "calc-size(auto, size * 0)",
        ':is([data-open="true"])': "calc-size(auto, size)",
      },
    },
    opacity: {
      default: 0,
      ':is([data-open="true"])': 1,
    },
    transitionProperty: "opacity,height",
    interpolateSize: {
      default: null,
      "@supports (interpolate-size: allow-keywords)": "allow-keywords",
    },
  },
  supportsHoverOrder: {
    color: {
      default: "black",
      "@supports (color: color(display-p3 1 0 0))": {
        default: "blue",
        ":hover": "color(display-p3 1 0 0)",
      },
    },
  },
});

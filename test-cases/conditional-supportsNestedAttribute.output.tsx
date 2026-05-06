import * as stylex from "@stylexjs/stylex";

export const App = () => (
  <div data-open="true" sx={styles.collapsibleRegion}>
    <div>Open content</div>
  </div>
);

const styles = stylex.create({
  collapsibleRegion: {
    overflow: "hidden",
    height: {
      default: 0,
      ':is([data-open="true"])': "calc-size(auto, size)",
    },
    opacity: {
      default: 0,
      ':is([data-open="true"])': 1,
    },
    transitionProperty: "opacity,height",
    interpolateSize: "allow-keywords",
  },
});

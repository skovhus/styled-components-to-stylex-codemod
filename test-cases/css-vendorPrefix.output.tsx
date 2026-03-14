import * as stylex from "@stylexjs/stylex";

export const App = () => (
  <div>
    <div sx={styles.box} />
    <input type="range" sx={styles.slider} />
  </div>
);

const styles = stylex.create({
  box: {
    WebkitAppearance: "textfield",
    appearance: "none",
  },
  slider: {
    "::-webkit-slider-thumb": {
      width: 10,
    },
  },
});

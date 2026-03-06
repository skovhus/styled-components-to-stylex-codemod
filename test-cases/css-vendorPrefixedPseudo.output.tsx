import * as stylex from "@stylexjs/stylex";

export const App = () => <input type="range" sx={styles.slider} />;

const styles = stylex.create({
  slider: {
    "::-webkit-slider-thumb": {
      width: "10px",
    },
  },
});

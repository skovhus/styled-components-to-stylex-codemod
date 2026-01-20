import * as stylex from "@stylexjs/stylex";

export const App = () => <input type="range" {...stylex.props(styles.slider)} />;

const styles = stylex.create({
  slider: {
    "::-webkit-slider-thumb": {
      width: "10px",
    },
  },
});

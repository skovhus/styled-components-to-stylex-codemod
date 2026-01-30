import * as stylex from "@stylexjs/stylex";

const color1 = "#ff0000";
const color2 = "#0000ff";
export const App = () => <div {...stylex.props(styles.gradientBox)}>Gradient</div>;

const styles = stylex.create({
  gradientBox: {
    backgroundImage: `linear-gradient(${color1}, ${color2})`,
    width: "200px",
    height: "100px",
  },
});

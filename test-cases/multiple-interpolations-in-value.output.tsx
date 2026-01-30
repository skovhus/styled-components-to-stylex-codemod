import * as stylex from "@stylexjs/stylex";

const color1 = "#ff0000";
const color2 = "#0000ff";
const color3 = "#00ff00";

export const App = () => (
  <>
    <div {...stylex.props(styles.linearGradientBox)}>Linear</div>
    <div {...stylex.props(styles.radialGradientBox)}>Radial</div>
    <div {...stylex.props(styles.conicGradientBox)}>Conic</div>
    <div {...stylex.props(styles.repeatingLinearGradientBox)}>Repeating</div>
  </>
);

const styles = stylex.create({
  linearGradientBox: {
    backgroundImage: `linear-gradient(${color1}, ${color2})`,
    width: "200px",
    height: "100px",
  },
  radialGradientBox: {
    backgroundImage: `radial-gradient(${color1}, ${color2})`,
    width: "200px",
    height: "100px",
  },
  conicGradientBox: {
    backgroundImage: `conic-gradient(${color1}, ${color2}, ${color3})`,
    width: "200px",
    height: "100px",
  },
  repeatingLinearGradientBox: {
    backgroundImage: `repeating-linear-gradient(${color1} 0%, ${color2} 10%)`,
    width: "200px",
    height: "100px",
  },
});

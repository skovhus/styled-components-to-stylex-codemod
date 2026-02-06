import * as stylex from "@stylexjs/stylex";

export const App = () => <div {...stylex.props(styles.box)} />;

const styles = stylex.create({
  box: {
    WebkitAppearance: "textfield",
    appearance: "none",
  },
});

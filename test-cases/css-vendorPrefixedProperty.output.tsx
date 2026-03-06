import * as stylex from "@stylexjs/stylex";

export const App = () => <div sx={styles.box} />;

const styles = stylex.create({
  box: {
    WebkitAppearance: "textfield",
    appearance: "none",
  },
});

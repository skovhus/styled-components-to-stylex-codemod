import * as stylex from "@stylexjs/stylex";

export const App = () => <div sx={styles.box}>Later base rule wins</div>;

const styles = stylex.create({
  box: {
    position: "relative",
    top: 2,
    backgroundColor: "peachpuff",
  },
});

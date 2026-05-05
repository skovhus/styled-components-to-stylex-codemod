import * as stylex from "@stylexjs/stylex";

export const App = () => <button sx={styles.clickTarget}>Click target</button>;

const styles = stylex.create({
  clickTarget: {
    cursor: "pointer",
    paddingBlock: 8,
    paddingInline: 12,
    backgroundColor: "#dbeafe",
    borderWidth: 0,
  },
});

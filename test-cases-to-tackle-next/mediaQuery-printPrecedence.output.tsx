import * as stylex from "@stylexjs/stylex";

export const App = () => <div sx={styles.loadingContainer}>Loading</div>;

const styles = stylex.create({
  loadingContainer: {
    display: {
      default: "flex",
      "@media print": "block",
    },
    overflow: {
      default: "auto",
      "@media print": "visible",
    },
    alignItems: "center",
    justifyContent: "center",
    minHeight: 80,
  },
});

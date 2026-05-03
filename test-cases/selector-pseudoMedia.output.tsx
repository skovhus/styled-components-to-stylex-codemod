import * as stylex from "@stylexjs/stylex";

export const App = () => <div sx={styles.box}>Hover or focus me, and resize!</div>;

const styles = stylex.create({
  box: {
    color: {
      default: "blue",
      ":hover": "red",
      ":focus-visible": "green",
      "@media (max-width: 600px)": "orange",
    },
    backgroundColor: {
      default: "white",
      ":hover": "lightblue",
      "@media (max-width: 600px)": "gray",
    },
    outline: {
      default: null,
      ":focus-visible": "2px solid blue",
    },
  },
});

import * as stylex from "@stylexjs/stylex";

export const App = () => (
  <div tabIndex={0} sx={styles.box}>
    Hover, focus, or resize
  </div>
);

const styles = stylex.create({
  box: {
    display: "inline-block",
    padding: 16,
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

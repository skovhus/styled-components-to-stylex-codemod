import * as stylex from "@stylexjs/stylex";

export const App = () => (
  <div sx={styles.toastLayer}>
    <div sx={styles.dropIndicator} />
  </div>
);

const styles = stylex.create({
  toastLayer: {
    zIndex: 801,
    position: "fixed",
    inset: 16,
    backgroundColor: "white",
  },
  dropIndicator: {
    zIndex: 899,
    position: "relative",
    height: 8,
    backgroundColor: "#60a5fa",
  },
});

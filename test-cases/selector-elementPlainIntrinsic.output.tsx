import * as stylex from "@stylexjs/stylex";

export const App = () => (
  <div sx={styles.container}>
    <svg viewBox="0 0 24 24" sx={[styles.icon, styles.descendantIcon, styles.childIcon]}>
      <circle cx="12" cy="12" r="10" />
    </svg>
    <svg viewBox="0 0 24 24" sx={[styles.descendantSvg, styles.childSvg]}>
      <rect width="10" height="10" />
    </svg>
  </div>
);

const styles = stylex.create({
  icon: {
    fill: "gray",
    width: 24,
    height: 24,
  },
  container: {
    padding: 16,
  },
  descendantSvg: {
    fill: "blue",
  },
  descendantIcon: {
    fill: "blue",
  },
  childSvg: {
    stroke: "red",
    strokeWidth: 2,
  },
  childIcon: {
    stroke: "red",
    strokeWidth: 2,
  },
});

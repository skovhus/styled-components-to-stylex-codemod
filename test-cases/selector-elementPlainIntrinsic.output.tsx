import * as stylex from "@stylexjs/stylex";

export const App = () => (
  <div sx={styles.container}>
    <svg viewBox="0 0 24 24" sx={[styles.icon, styles.iconInDescendant, styles.iconInChild]}>
      <circle cx="12" cy="12" r="10" />
    </svg>
    <svg viewBox="0 0 24 24" sx={[styles.svgInDescendant, styles.svgInChild]}>
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
  svgInDescendant: {
    fill: "blue",
  },
  iconInDescendant: {
    fill: "blue",
  },
  svgInChild: {
    stroke: "red",
    strokeWidth: 2,
  },
  iconInChild: {
    stroke: "red",
    strokeWidth: 2,
  },
});

import * as stylex from "@stylexjs/stylex";

export const App = () => (
  <div sx={styles.container}>
    <svg viewBox="0 0 16 16" sx={[styles.smallIcon, styles.smallIconInDescendant]}>
      <circle cx="8" cy="8" r="6" />
    </svg>
    <svg viewBox="0 0 32 32" sx={[styles.largeIcon, styles.largeIconInDescendant]}>
      <circle cx="16" cy="16" r="12" />
    </svg>
  </div>
);

const styles = stylex.create({
  smallIcon: {
    fill: "gray",
    width: 16,
  },
  largeIcon: {
    fill: "gray",
    width: 32,
  },
  container: {
    padding: 16,
  },
  largeIconInDescendant: {
    fill: "blue",
  },
  smallIconInDescendant: {
    fill: "blue",
  },
});

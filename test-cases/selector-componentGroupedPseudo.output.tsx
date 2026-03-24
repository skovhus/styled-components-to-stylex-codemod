import * as stylex from "@stylexjs/stylex";

export const App = () => (
  <a href="#" sx={[styles.link, stylex.defaultMarker()]}>
    <span sx={[styles.badge, styles.badgeInLink]}>Badge (blue on focus-visible OR active)</span>
  </a>
);

const styles = stylex.create({
  link: {
    display: "flex",
    padding: 8,
    backgroundColor: "papayawhip",
  },
  // Grouped reverse selectors: ${Link}:focus-visible &, ${Link}:active &
  // Multiple pseudo branches in a single selector.
  badge: {
    paddingBlock: 4,
    paddingInline: 8,
    color: "gray",
  },
  badgeInLink: {
    color: {
      default: "gray",
      [stylex.when.ancestor(":focus-visible")]: "blue",
      [stylex.when.ancestor(":active")]: "blue",
    },
  },
});

import * as stylex from "@stylexjs/stylex";

export const App = () => (
  <a href="#" {...stylex.props(styles.link, stylex.defaultMarker())}>
    <span {...stylex.props(styles.badge, styles.badgeInLink)}>
      Badge (blue on focus-visible OR active)
    </span>
  </a>
);

const styles = stylex.create({
  link: {
    display: "flex",
    padding: "8px",
    backgroundColor: "papayawhip",
  },
  // Grouped reverse selectors: ${Link}:focus-visible &, ${Link}:active &
  // Multiple pseudo branches in a single selector.
  badge: {
    paddingBlock: "4px",
    paddingInline: "8px",
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

import * as stylex from "@stylexjs/stylex";

export const App = () => (
  <a href="#" {...stylex.props(styles.link, stylex.defaultMarker())}>
    <span {...stylex.props(styles.badge, styles.badgeInLink)}>
      Label (gray, orange on focus, blue on Link hover)
    </span>
  </a>
);

const styles = stylex.create({
  link: {
    display: "flex",
    padding: "8px",
    backgroundColor: "papayawhip",
  },
  // The child has a base :focus pseudo on color, AND a reverse ancestor override on color.
  // The default in the override must be the scalar base value, not the pseudo map object.
  badge: {
    paddingBlock: "4px",
    paddingInline: "8px",
    color: {
      default: "gray",
      ":focus": "orange",
    },
  },
  badgeInLink: {
    color: {
      default: "gray",
      [stylex.when.ancestor(":hover")]: "blue",
    },
  },
});

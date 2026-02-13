import * as stylex from "@stylexjs/stylex";
import { $colors } from "./tokens.stylex";

export const App = () => (
  <a href="#" {...stylex.props(styles.link, stylex.defaultMarker())}>
    <span {...stylex.props(styles.badge, styles.badgeInLink)}>Label</span>
    Hover me
  </a>
);

const styles = stylex.create({
  link: {
    display: "flex",
    padding: "8px",
    backgroundColor: "papayawhip",
    color: "#bf4f74",
  },
  // Two interpolation slots in a single declaration value.
  // Both must resolve independently to their respective theme tokens.
  badge: {
    paddingBlock: "4px",
    paddingInline: "8px",
  },
  badgeInLink: {
    boxShadow: {
      default: null,
      [stylex.when.ancestor(":hover")]: `0 4px 8px ${$colors.labelBase}`,
    },
    border: {
      default: null,
      [stylex.when.ancestor(":hover")]: `2px solid ${$colors.bgSub}`,
    },
  },
});

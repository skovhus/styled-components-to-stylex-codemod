import * as stylex from "@stylexjs/stylex";
import { $colors } from "./tokens.stylex";

export const App = () => (
  <a href="#" sx={[styles.link, stylex.defaultMarker()]}>
    <span sx={[styles.badge, styles.badgeInLink]}>Label</span>
    Hover me
  </a>
);

const styles = stylex.create({
  link: {
    display: "flex",
    padding: 8,
    backgroundColor: "papayawhip",
    color: "#bf4f74",
  },
  // Two interpolation slots in a single declaration value.
  // Both must resolve independently to their respective theme tokens.
  badge: {
    paddingBlock: 4,
    paddingInline: 8,
  },
  badgeInLink: {
    boxShadow: {
      default: null,
      [stylex.when.ancestor(":hover")]: `0 4px 8px ${$colors.labelBase}`,
    },
    borderWidth: {
      default: null,
      [stylex.when.ancestor(":hover")]: 2,
    },
    borderStyle: {
      default: null,
      [stylex.when.ancestor(":hover")]: "solid",
    },
    borderColor: {
      default: null,
      [stylex.when.ancestor(":hover")]: $colors.bgSub,
    },
  },
});

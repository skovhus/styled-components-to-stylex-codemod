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
    alignItems: "center",
    paddingBlock: 5,
    paddingInline: 10,
    backgroundColor: "papayawhip",
    color: "#bf4f74",
  },
  // Reverse component selector with interpolated theme value
  badge: {
    paddingBlock: 4,
    paddingInline: 8,
    backgroundColor: $colors.bgSub,
  },
  badgeInLink: {
    outline: {
      default: null,
      [stylex.when.ancestor(":focus-visible")]: `2px solid ${$colors.labelBase}`,
    },
  },
});

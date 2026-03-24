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
    paddingTop: 5,
    paddingRight: 10,
    paddingBottom: 5,
    paddingLeft: 10,
    backgroundColor: "papayawhip",
    color: "#bf4f74",
  },
  // Reverse component selector with interpolated theme value
  badge: {
    paddingTop: 4,
    paddingRight: 8,
    paddingBottom: 4,
    paddingLeft: 8,
    backgroundColor: $colors.bgSub,
  },
  badgeInLink: {
    outline: {
      default: null,
      [stylex.when.ancestor(":focus-visible")]: `2px solid ${$colors.labelBase}`,
    },
  },
});

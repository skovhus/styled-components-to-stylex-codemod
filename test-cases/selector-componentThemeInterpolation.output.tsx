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
    alignItems: "center",
    paddingBlock: "5px",
    paddingInline: "10px",
    backgroundColor: "papayawhip",
    color: "#bf4f74",
  },
  // Reverse component selector with interpolated theme value
  badge: {
    paddingBlock: "4px",
    paddingInline: "8px",
    backgroundColor: $colors.bgSub,
  },
  badgeInLink: {
    outline: {
      default: null,
      [stylex.when.ancestor(":focus-visible")]: `2px solid ${$colors.labelBase}`,
    },
  },
});

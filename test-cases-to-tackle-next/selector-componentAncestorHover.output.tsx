import * as stylex from "@stylexjs/stylex";

export const App = () => (
  <div sx={[styles.hoverCard, stylex.defaultMarker()]}>
    <span>Hover card</span>
    <button sx={[styles.hoverAction, styles.hoverActionInHoverCard]}>Action</button>
  </div>
);

const styles = stylex.create({
  hoverAction: {
    opacity: 0,
    transform: "translateY(2px)",
    transition: "opacity 0.2s,transform 0.2s",
  },
  hoverCard: {
    padding: 16,
    backgroundColor: "#f1f5f9",
    color: "#334155",
  },
  hoverActionInHoverCard: {
    opacity: {
      default: 0,
      [stylex.when.ancestor(":hover")]: 1,
    },
    transform: {
      default: "translateY(2px)",
      [stylex.when.ancestor(":hover")]: "translateY(0)",
    },
  },
});

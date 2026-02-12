import * as stylex from "@stylexjs/stylex";
import { CollapseArrowIcon } from "./lib/collapse-arrow-icon";

export const App = () => (
  <div>
    <CollapseArrowIcon />
    <button {...stylex.props(styles.button, styles.styledCollapseButton, stylex.defaultMarker())}>
      <CollapseArrowIcon {...stylex.props(styles.collapseArrowIconInStyledCollapseButton)} />
      Toggle
    </button>
  </div>
);

const styles = stylex.create({
  // Simulate a Button component
  button: {
    display: "inline-flex",
    alignItems: "center",
    paddingBlock: "8px",
    paddingInline: "12px",
    backgroundColor: "#f0f0f0",
    borderWidth: "1px",
    borderStyle: "solid",
    borderColor: "#ccc",
    borderRadius: "4px",
    cursor: "pointer",
  },
  // This styled component uses the imported CollapseArrowIcon as a CSS selector
  // After the icon is converted to StyleX, this pattern breaks
  styledCollapseButton: {
    gap: "8px",
  },
  collapseArrowIconInStyledCollapseButton: {
    width: "18px",
    height: "auto",
    transition: "transform 0.2s",
    transform: {
      default: null,
      [stylex.when.ancestor(":hover")]: "rotate(180deg)",
    },
  },
});

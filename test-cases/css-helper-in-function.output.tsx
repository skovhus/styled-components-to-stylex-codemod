import * as stylex from "@stylexjs/stylex";
import { mergedSx } from "./lib/mergedSx";
import { $colors } from "./tokens.stylex";

export function getPrimaryStyles() {
  return styles.getPrimaryStyles;
}

export const App = () => <button {...stylex.props(styles.button)}>Click me</button>;

const styles = stylex.create({
  button: {
    paddingBlock: "8px",
    paddingInline: "16px",
    borderRadius: "4px",
  },
  getPrimaryStyles: {
    backgroundColor: $colors.primaryColor,
    color: $colors.labelMuted,
  },
});

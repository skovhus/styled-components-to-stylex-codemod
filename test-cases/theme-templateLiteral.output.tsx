import * as stylex from "@stylexjs/stylex";
import { $colors } from "./tokens.stylex";

export const App = () => (
  <div style={{ display: "flex", gap: 12, padding: 16 }}>
    <div {...stylex.props(styles.box)}>Template literal with theme</div>
  </div>
);

const styles = stylex.create({
  box: {
    padding: "16px",
    boxShadow: `inset 0 0 0 1px ${$colors.bgBorderFaint}`,
    color: $colors.labelBase,
  },
});

import * as stylex from "@stylexjs/stylex";
import { $colors } from "./tokens.stylex";

export const App = () => (
  <div style={{ display: "flex", gap: 16, padding: 16 }}>
    <div {...stylex.props(styles.toggle)}>Toggle</div>
  </div>
);

const styles = stylex.create({
  toggle: {
    backgroundColor: `color-mix(in srgb, ${$colors.bgBase} 40%, transparent)`,
    paddingBlock: "8px",
    paddingInline: "16px",
  },
});

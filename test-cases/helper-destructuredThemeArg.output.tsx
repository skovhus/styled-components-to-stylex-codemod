import * as stylex from "@stylexjs/stylex";
import { $colors } from "./tokens.stylex";

export const App = () => (
  <div style={{ display: "flex", gap: 16, padding: 16 }}>
    <div sx={[styles.borderBottom, styles.box]}>Box with border</div>
  </div>
);

const styles = stylex.create({
  box: {
    paddingBlock: 8,
    paddingInline: 16,
  },
  borderBottom: {
    borderBottomWidth: "1px",
    borderBottomStyle: "solid",
    borderBottomColor: $colors.bgSub,
  },
});

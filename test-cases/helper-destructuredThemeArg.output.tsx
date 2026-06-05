import * as stylex from "@stylexjs/stylex";
import { $colors } from "./tokens.stylex";

export const App = () => (
  <div style={{ display: "flex", gap: 16, padding: 16 }}>
    <div sx={styles.box}>Box with border</div>
  </div>
);

const styles = stylex.create({
  box: {
    borderBottomWidth: 1,
    borderBottomStyle: "solid",
    borderBottomColor: $colors.bgSub,
    paddingBlock: 8,
    paddingInline: 16,
  },
});

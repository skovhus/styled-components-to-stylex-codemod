import * as stylex from "@stylexjs/stylex";
import { $colors } from "./tokens.stylex";

export const App = () => (
  <div>
    <div sx={styles.box}>Themed helper border</div>
    <div sx={styles.separator}>Themed helper separator</div>
  </div>
);

const styles = stylex.create({
  box: {
    padding: 12,
    borderBottomWidth: "1px",
    borderBottomStyle: "solid",
    borderBottomColor: $colors.bgSub,
  },
  separator: {
    borderTopWidth: "1px",
    borderTopStyle: "solid",
    borderTopColor: $colors.bgBorderFaint,
    marginBlock: 8,
    marginInline: 0,
  },
});

import * as stylex from "@stylexjs/stylex";
import { $colors } from "./tokens.stylex";

export const App = () => <div sx={[styles.boxBorderBottom, styles.box]}>Themed helper border</div>;

const styles = stylex.create({
  box: {
    padding: 12,
  },
  boxBorderBottom: {
    borderBottomWidth: "1px",
    borderBottomStyle: "solid",
    borderBottomColor: $colors.bgSub,
  },
});

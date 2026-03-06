import * as stylex from "@stylexjs/stylex";
import { $colors } from "./tokens.stylex";

export const App = () => <div sx={styles.box}>Fallback test</div>;

const styles = stylex.create({
  box: {
    color: $colors.labelBase ?? "black",
  },
});

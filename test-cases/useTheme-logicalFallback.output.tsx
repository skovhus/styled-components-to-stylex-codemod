import * as stylex from "@stylexjs/stylex";
import { $colors } from "./tokens.stylex";

export const App = () => <div {...stylex.props(styles.box)}>Theme fallback</div>;

const styles = stylex.create({
  // Theme value fallback should resolve through adapter theme mappings.
  box: {
    color: $colors.labelBase,
  },
});

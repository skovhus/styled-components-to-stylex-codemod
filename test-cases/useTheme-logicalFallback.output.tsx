import * as stylex from "@stylexjs/stylex";
import { $colors } from "./tokens.stylex";

export const App = () => <div {...stylex.props(styles.box)}>Fallback label</div>;

const styles = stylex.create({
  // Theme logical fallback with a static literal should resolve through adapter theme tokens.
  box: {
    color: $colors.labelBase ?? "black",
  },
});

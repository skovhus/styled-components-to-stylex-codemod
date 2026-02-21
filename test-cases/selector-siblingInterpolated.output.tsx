import * as stylex from "@stylexjs/stylex";
import { $colors } from "./tokens.stylex";

export const App = () => (
  <div style={{ padding: 16 }}>
    <div {...stylex.props(styles.thing, stylex.defaultMarker())}>First</div>
    <div {...stylex.props(styles.thing, stylex.defaultMarker())}>Second (theme color)</div>
  </div>
);

const styles = stylex.create({
  thing: {
    color: {
      default: "blue",
      [stylex.when.siblingBefore(":is(*)")]: $colors.labelBase,
    },
  },
});

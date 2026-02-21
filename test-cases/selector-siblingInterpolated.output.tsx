import * as stylex from "@stylexjs/stylex";
import { $colors } from "./tokens.stylex";

export const App = () => (
  <div style={{ padding: 16 }}>
    <div {...stylex.props(styles.thing, thingMarker)}>First</div>
    <div {...stylex.props(styles.thing, thingMarker)}>Second (theme color)</div>
  </div>
);
export const thingMarker = stylex.defineMarker();

const styles = stylex.create({
  thing: {
    color: {
      default: "blue",
      [stylex.when.siblingBefore(thingMarker)]: $colors.labelBase,
    },
  },
});

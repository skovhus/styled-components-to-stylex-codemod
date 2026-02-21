import * as stylex from "@stylexjs/stylex";

export const App = () => (
  <div style={{ display: "flex", flexDirection: "column", gap: 4, padding: 16 }}>
    <div {...stylex.props(styles.thing, thingMarker)}>First (blue)</div>
    <div {...stylex.props(styles.thing, thingMarker)}>Second (red - adjacent)</div>
  </div>
);
export const thingMarker = stylex.defineMarker();

const styles = stylex.create({
  // The adjacent sibling rule appears BEFORE the base color declaration.
  // The base value must still be preserved as the default.
  thing: {
    color: {
      default: "blue",
      [stylex.when.siblingBefore(thingMarker)]: "red",
    },
    paddingBlock: "8px",
    paddingInline: "16px",
  },
});

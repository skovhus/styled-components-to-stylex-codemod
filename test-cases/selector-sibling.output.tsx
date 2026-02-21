import * as stylex from "@stylexjs/stylex";

export const App = () => (
  <div style={{ display: "flex", flexDirection: "column", gap: 4, padding: 16 }}>
    <div {...stylex.props(styles.thing, thingMarker)}>First (blue)</div>
    <div {...stylex.props(styles.thing, thingMarker)}>Second (red, lime - adjacent)</div>
    <div {...stylex.props(styles.thing, thingMarker)}>Third (red, lime - adjacent)</div>
  </div>
);
export const thingMarker = stylex.defineMarker();

const styles = stylex.create({
  thing: {
    color: {
      default: "blue",
      [stylex.when.siblingBefore(thingMarker)]: "red",
    },
    paddingBlock: "8px",
    paddingInline: "16px",
    backgroundColor: {
      default: null,
      [stylex.when.siblingBefore(thingMarker)]: "lime",
    },
  },
});

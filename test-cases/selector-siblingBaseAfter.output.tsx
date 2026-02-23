import * as stylex from "@stylexjs/stylex";

export const App = () => (
  <div style={{ display: "flex", flexDirection: "column", gap: 4, padding: 16 }}>
    <div {...stylex.props(styles.thing, stylex.defaultMarker())}>First (blue)</div>
    <div {...stylex.props(styles.thing, stylex.defaultMarker())}>Second (red - adjacent)</div>
  </div>
);

const styles = stylex.create({
  // The adjacent sibling rule appears BEFORE the base color declaration.
  // The base value must still be preserved as the default.
  thing: {
    color: {
      default: "blue",
      [stylex.when.siblingBefore(":is(*)")]: "red",
    },
    paddingBlock: "8px",
    paddingInline: "16px",
  },
});

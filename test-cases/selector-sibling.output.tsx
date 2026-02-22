import * as stylex from "@stylexjs/stylex";

// NOTE: StyleX siblingBefore() emits `~ *` (general sibling), not `+ *`
// (adjacent sibling). When an unrelated element is interleaved between two
// Thing instances, CSS `& + &` would NOT match the second Thing, but
// siblingBefore() WILL — this is a known semantic broadening.
export const App = () => (
  <div style={{ display: "flex", flexDirection: "column", gap: 4, padding: 16 }}>
    <div {...stylex.props(styles.thing, stylex.defaultMarker())}>First (blue)</div>
    <div {...stylex.props(styles.thing, stylex.defaultMarker())}>Second (red, lime - adjacent)</div>
    <div {...stylex.props(styles.thing, stylex.defaultMarker())}>Third (red, lime - adjacent)</div>
  </div>
);

const styles = stylex.create({
  thing: {
    color: {
      default: "blue",
      [stylex.when.siblingBefore(":is(*)")]: "red",
    },
    paddingBlock: "8px",
    paddingInline: "16px",
    backgroundColor: {
      default: null,
      [stylex.when.siblingBefore(":is(*)")]: "lime",
    },
  },
});

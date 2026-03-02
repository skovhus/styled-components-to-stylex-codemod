import React from "react";
import * as stylex from "@stylexjs/stylex";

function Thing(props: { children?: React.ReactNode }) {
  return <div {...stylex.props(styles.thing, stylex.defaultMarker())}>{props.children}</div>;
}

// NOTE: StyleX siblingBefore() emits `~ *` (general sibling), not `+ *`
// (adjacent sibling). When an unrelated element is interleaved between two
// Thing instances, CSS `& + &` would NOT match the second Thing, but
// siblingBefore() WILL — this is a known semantic broadening.
export const App = () => (
  <div style={{ display: "flex", flexDirection: "column", gap: 4, padding: 16 }}>
    <Thing>First (blue)</Thing>
    <Thing>Second (red, lime - adjacent)</Thing>
    <Thing>Third (red, lime - adjacent)</Thing>
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

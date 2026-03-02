import React from "react";
import * as stylex from "@stylexjs/stylex";

// The adjacent sibling rule appears BEFORE the base color declaration.
// The base value must still be preserved as the default.
function Thing(props: { children?: React.ReactNode }) {
  return <div {...stylex.props(styles.thing, stylex.defaultMarker())}>{props.children}</div>;
}

export const App = () => (
  <div style={{ display: "flex", flexDirection: "column", gap: 4, padding: 16 }}>
    <Thing>First (blue)</Thing>
    <Thing>Second (red - adjacent)</Thing>
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
  },
});

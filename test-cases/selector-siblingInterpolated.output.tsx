import React from "react";
import * as stylex from "@stylexjs/stylex";
import { $colors } from "./tokens.stylex";

function Thing(props: { children?: React.ReactNode }) {
  return <div {...stylex.props(styles.thing, stylex.defaultMarker())}>{props.children}</div>;
}

export const App = () => (
  <div style={{ padding: 16 }}>
    <Thing>First</Thing>
    <Thing>Second (theme color)</Thing>
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

import React from "react";
import * as stylex from "@stylexjs/stylex";
import { ThingMarker } from "./selector-siblingBaseAfter.input.stylex";

// The adjacent sibling rule appears BEFORE the base color declaration.
// The base value must still be preserved as the default.
function Thing(props: React.PropsWithChildren<{}>) {
  return <div sx={[styles.thing, ThingMarker]}>{props.children}</div>;
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
      // NOTE: CSS `+` (adjacent sibling) becomes `~` (general sibling) in StyleX
      [stylex.when.siblingBefore(":is(*)", ThingMarker)]: "red",
    },
    paddingBlock: 8,
    paddingInline: 16,
  },
});

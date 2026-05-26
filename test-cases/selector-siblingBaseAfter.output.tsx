import React from "react";
import * as stylex from "@stylexjs/stylex";
import { ThingMarker } from "./selector-siblingBaseAfter.input.stylex";

// The general sibling rule appears BEFORE the base color declaration.
// The base value must still be preserved as the default.
function Thing({ children }: { children?: React.ReactNode }) {
  return <div sx={[styles.thing, ThingMarker]}>{children}</div>;
}

export const App = () => (
  <div style={{ display: "flex", flexDirection: "column", gap: 4, padding: 16 }}>
    <Thing>First (blue)</Thing>
    <Thing>Second (red - general sibling)</Thing>
  </div>
);

const styles = stylex.create({
  thing: {
    color: {
      default: "blue",
      [stylex.when.siblingBefore(":is(*)", ThingMarker)]: "red",
    },
    paddingBlock: 8,
    paddingInline: 16,
  },
});

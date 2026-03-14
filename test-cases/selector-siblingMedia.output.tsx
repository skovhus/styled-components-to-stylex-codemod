import React from "react";
import * as stylex from "@stylexjs/stylex";
import { ThingMarker } from "./selector-siblingMedia.input.stylex";

function Thing(props: React.PropsWithChildren<{}>) {
  return <div sx={[styles.thing, ThingMarker, stylex.defaultMarker()]}>{props.children}</div>;
}

export const App = () => (
  <div style={{ padding: 16 }}>
    <Thing>First</Thing>
    <Thing>Second (margin-top on wide screens)</Thing>
  </div>
);

const styles = stylex.create({
  thing: {
    color: "blue",
    padding: 8,
    marginTop: {
      default: null,

      [stylex.when.siblingBefore(":is(*)", ThingMarker)]: {
        default: null,
        "@media (min-width: 768px)": 16,
      },
    },
  },
});

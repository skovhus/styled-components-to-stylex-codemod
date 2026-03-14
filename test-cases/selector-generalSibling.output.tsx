import React from "react";
import * as stylex from "@stylexjs/stylex";
import { ThingMarker } from "./selector-generalSibling.input.stylex";

function Thing(props: React.PropsWithChildren<{}>) {
  return <div sx={[styles.thing, ThingMarker, stylex.defaultMarker()]}>{props.children}</div>;
}

export const App = () => (
  <div style={{ padding: 16 }}>
    <Thing>First</Thing>
    <Thing>Second (border-bottom in CSS)</Thing>
    <Thing>Third (border-bottom in CSS)</Thing>
  </div>
);

const styles = stylex.create({
  thing: {
    color: "blue",
    paddingBlock: 8,
    paddingInline: 16,
    borderBottomWidth: {
      default: null,
      [stylex.when.siblingBefore(":is(*)", ThingMarker)]: 2,
    },
    borderBottomStyle: {
      default: null,
      [stylex.when.siblingBefore(":is(*)", ThingMarker)]: "solid",
    },
    borderBottomColor: {
      default: null,
      [stylex.when.siblingBefore(":is(*)", ThingMarker)]: "gray",
    },
  },
});

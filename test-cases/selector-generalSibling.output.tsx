import React from "react";
import * as stylex from "@stylexjs/stylex";

function Thing(props: React.PropsWithChildren<{}>) {
  return <div {...stylex.props(styles.thing, stylex.defaultMarker())}>{props.children}</div>;
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
    paddingBlock: "8px",
    paddingInline: "16px",
    borderBottomWidth: {
      default: null,
      [stylex.when.siblingBefore(":is(*)")]: "2px",
    },
    borderBottomStyle: {
      default: null,
      [stylex.when.siblingBefore(":is(*)")]: "solid",
    },
    borderBottomColor: {
      default: null,
      [stylex.when.siblingBefore(":is(*)")]: "gray",
    },
  },
});

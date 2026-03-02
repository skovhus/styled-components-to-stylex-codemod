import React from "react";
import * as stylex from "@stylexjs/stylex";

function Thing(props: { children?: React.ReactNode }) {
  const { children } = props;

  return <div {...stylex.props(styles.thing, stylex.defaultMarker())}>{children}</div>;
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
    padding: "8px",
    marginTop: {
      default: null,

      [stylex.when.siblingBefore(":is(*)")]: {
        default: null,
        "@media (min-width: 768px)": "16px",
      },
    },
  },
});

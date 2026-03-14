import React from "react";
import * as stylex from "@stylexjs/stylex";

function Thing(props: React.PropsWithChildren<{}>) {
  return <div sx={[styles.thing, stylex.defaultMarker()]}>{props.children}</div>;
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
      /* eslint-disable stylex/valid-styles -- computed stylex.when.*() key */

      [stylex.when.siblingBefore(":is(*)")]: {
        default: null,
        "@media (min-width: 768px)": 16,
      },
      /* eslint-enable stylex/valid-styles */
    },
  },
});

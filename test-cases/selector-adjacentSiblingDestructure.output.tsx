import React from "react";
import * as stylex from "@stylexjs/stylex";

function Row(props: { children?: React.ReactNode }) {
  return <div {...stylex.props(styles.row, stylex.defaultMarker())}>{props.children}</div>;
}

export const App = () => (
  <div>
    <Row>First</Row>
    <Row>Second</Row>
  </div>
);

const styles = stylex.create({
  row: {
    marginTop: {
      default: null,
      [stylex.when.siblingBefore(":is(*)")]: "16px",
    },
  },
});

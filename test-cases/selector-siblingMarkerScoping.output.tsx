import React from "react";
import * as stylex from "@stylexjs/stylex";

// NOTE: defaultMarker() is file-global — not scoped per component.
// If another component in the same file also uses defaultMarker() (e.g. for
// an ancestor relation override), its marker could incorrectly activate
// Row's sibling styles. Use defineMarker() for strict scoping.
function Row(props: { children?: React.ReactNode }) {
  const { children } = props;

  return <div {...stylex.props(styles.row, stylex.defaultMarker())}>{children}</div>;
}

export const App = () => (
  <div {...stylex.props(styles.container)}>
    <Row>First</Row>
    <Row>Second (should have border-top)</Row>
  </div>
);

const styles = stylex.create({
  container: {
    display: "flex",
    flexDirection: "column",
    gap: "4px",
  },
  row: {
    color: "blue",
    padding: "8px",
    borderTopWidth: {
      default: null,
      [stylex.when.siblingBefore(":is(*)")]: "1px",
    },
    borderTopStyle: {
      default: null,
      [stylex.when.siblingBefore(":is(*)")]: "solid",
    },
    borderTopColor: {
      default: null,
      [stylex.when.siblingBefore(":is(*)")]: "gray",
    },
  },
});

import React from "react";
import * as stylex from "@stylexjs/stylex";
import { RowMarker } from "./selector-siblingMarkerScoping.input.stylex";

// NOTE: defaultMarker() is file-global — not scoped per component.
// If another component in the same file also uses defaultMarker() (e.g. for
// an ancestor relation override), its marker could incorrectly activate
// Row's sibling styles. Use defineMarker() for strict scoping.
function Row(props: React.PropsWithChildren<{}>) {
  return <div sx={[styles.row, RowMarker]}>{props.children}</div>;
}

export const App = () => (
  <div sx={styles.container}>
    <Row>First</Row>
    <Row>Second (should have border-top)</Row>
  </div>
);

const styles = stylex.create({
  container: {
    display: "flex",
    flexDirection: "column",
    gap: 4,
  },
  row: {
    color: "blue",
    padding: 8,
    borderTopWidth: {
      default: null,
      // TODO(codemod): CSS `+` (adjacent) was broadened to `~` (general sibling). Verify siblings are always adjacent.
      [stylex.when.siblingBefore(":is(*)", RowMarker)]: 1,
    },
    borderTopStyle: {
      default: null,
      // TODO(codemod): CSS `+` (adjacent) was broadened to `~` (general sibling). Verify siblings are always adjacent.
      [stylex.when.siblingBefore(":is(*)", RowMarker)]: "solid",
    },
    borderTopColor: {
      default: null,
      // TODO(codemod): CSS `+` (adjacent) was broadened to `~` (general sibling). Verify siblings are always adjacent.
      [stylex.when.siblingBefore(":is(*)", RowMarker)]: "gray",
    },
  },
});

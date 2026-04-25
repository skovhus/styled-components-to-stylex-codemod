import React from "react";
import * as stylex from "@stylexjs/stylex";
import { $colors } from "./tokens.stylex";
import { ThingMarker, ThingThemedMarker, RowMarker } from "./selector-sibling.input.stylex";

function Thing(props: React.PropsWithChildren<{}>) {
  return <div sx={[styles.thing, ThingMarker]}>{props.children}</div>;
}

// General sibling with theme interpolation
function ThingThemed(props: React.PropsWithChildren<{}>) {
  return <div sx={[styles.thingThemed, ThingThemedMarker]}>{props.children}</div>;
}

// Minimal general sibling (margin-top spacing pattern)
function Row(props: React.PropsWithChildren<{}>) {
  return <div sx={[styles.row, RowMarker]}>{props.children}</div>;
}

export const App = () => (
  <div style={{ display: "flex", flexDirection: "column", gap: 4, padding: 16 }}>
    <Thing>First (blue)</Thing>
    <Thing>Second (red, lime - general sibling)</Thing>
    <Thing>Third (red, lime - general sibling)</Thing>
    <ThingThemed>First themed</ThingThemed>
    <ThingThemed>Second themed (theme color)</ThingThemed>
    <Row>First row</Row>
    <Row>Second row (margin-top)</Row>
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
    backgroundColor: {
      default: null,
      [stylex.when.siblingBefore(":is(*)", ThingMarker)]: "lime",
    },
  },
  thingThemed: {
    color: {
      default: "blue",
      [stylex.when.siblingBefore(":is(*)", ThingThemedMarker)]: $colors.labelBase,
    },
  },
  row: {
    marginTop: {
      default: null,
      [stylex.when.siblingBefore(":is(*)", RowMarker)]: 16,
    },
  },
});

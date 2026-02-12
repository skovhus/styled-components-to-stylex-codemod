import React from "react";
import * as stylex from "@stylexjs/stylex";
import { mergedSx } from "./lib/mergedSx";

function Thing(
  props: React.PropsWithChildren<{
    className?: string;
    ref?: React.Ref<HTMLDivElement>;
  }>,
) {
  const { className, children } = props;

  return (
    <div
      {...mergedSx(
        [styles.thing, styles.thingSiblingBefore, styles.thingAnySibling, stylex.defaultMarker()],
        className,
      )}
    >
      {children}
    </div>
  );
}

export const App = () => (
  <div>
    <Thing>First (blue)</Thing>
    <Thing>Second (red, lime background - adjacent to first)</Thing>
    <Thing className="something">Third with .something class</Thing>
    <Thing>Fourth (yellow background - sibling after .something)</Thing>
    <Thing>Fifth (yellow background - sibling after .something)</Thing>
  </div>
);

const styles = stylex.create({
  thing: {
    color: "blue",
  },
  thingSiblingBefore: {
    color: {
      default: null,
      [stylex.when.siblingBefore(":is(*)")]: "red",
    },
    backgroundColor: {
      default: null,
      [stylex.when.siblingBefore(":is(*)")]: "lime",
    },
  },
  thingAnySibling: {
    backgroundColor: {
      default: null,
      [stylex.when.siblingBefore(":is(.something)")]: "yellow",
    },
  },
});

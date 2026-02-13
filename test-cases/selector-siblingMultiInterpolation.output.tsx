import React from "react";
import * as stylex from "@stylexjs/stylex";
import { mergedSx } from "./lib/mergedSx";
import { $colors } from "./tokens.stylex";

function Thing(
  props: React.PropsWithChildren<{
    className?: string;
    ref?: React.Ref<HTMLDivElement>;
  }>,
) {
  const { className, children } = props;

  return (
    <div
      {...mergedSx([styles.thing, styles.thingSiblingBefore, stylex.defaultMarker()], className)}
    >
      {children}
    </div>
  );
}

export const App = () => (
  <div>
    <Thing className="something">Anchor</Thing>
    <Thing>Follower one</Thing>
    <Thing>Follower two</Thing>
  </div>
);

const styles = stylex.create({
  thing: {
    color: "#223",
    backgroundColor: "white",
    padding: "8px",
  },
  thingSiblingBefore: {
    boxShadow: {
      default: null,
      [stylex.when.siblingBefore(":is(.something)")]: `0 0 ${$colors.labelBase} ${$colors.bgSub}`,
    },
  },
});

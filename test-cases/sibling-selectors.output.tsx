import React from "react";
import * as stylex from "@stylexjs/stylex";

const styles = stylex.create({
  thing: {
    color: "blue",
  },
  adjacentSibling: {
    color: "red",
    backgroundColor: "lime",
  },
  siblingAfterSomething: {
    backgroundColor: "yellow",
  },
});

interface ThingProps {
  isAdjacentSibling?: boolean;
  isSiblingAfterSomething?: boolean;
  children?: React.ReactNode;
  className?: string;
}

const Thing = ({ isAdjacentSibling, isSiblingAfterSomething, className, ...rest }: ThingProps) =>
  (() => {
    const sx = stylex.props(
      styles.thing,
      isAdjacentSibling && styles.adjacentSibling,
      isSiblingAfterSomething && styles.siblingAfterSomething,
    );

    return (
      <div {...sx} className={[sx.className, className].filter(Boolean).join(" ")}>
        {children}
      </div>
    );
  })();
const sx = stylex.props(
  styles.thing,
  isAdjacentSibling && styles.adjacentSibling,
  isSiblingAfterSomething && styles.siblingAfterSomething,
);

export const App = () => (
  <div>
    <Thing>First (blue)</Thing>
    <Thing>Second (red, lime background - adjacent to first)</Thing>
    <Thing className="something">Third with .something class</Thing>
    <Thing>Fourth (yellow background - sibling after .something)</Thing>
    <Thing>Fifth (yellow background - sibling after .something)</Thing>
  </div>
);

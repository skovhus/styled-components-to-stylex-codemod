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
  children: React.ReactNode;
  isAdjacentSibling?: boolean;
  isSiblingAfterSomething?: boolean;
  className?: string;
}

const Thing = ({ children, isAdjacentSibling, isSiblingAfterSomething, className }: ThingProps) =>
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

export const App = () => (
  <div>
    <Thing>First (blue)</Thing>
    <Thing isAdjacentSibling>Second (red, lime background - adjacent to first)</Thing>
    <Thing isAdjacentSibling className="something">
      Third with .something class
    </Thing>
    <Thing isAdjacentSibling isSiblingAfterSomething>
      Fourth (yellow background - sibling after .something)
    </Thing>
    <Thing isAdjacentSibling isSiblingAfterSomething>
      Fifth (yellow background - sibling after .something)
    </Thing>
  </div>
);

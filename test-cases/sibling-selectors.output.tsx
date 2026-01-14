import * as React from "react";
import * as stylex from "@stylexjs/stylex";
import { mergedSx } from "./lib/mergedSx";

type ThingProps = React.PropsWithChildren<{
  className?: string;
  isAdjacentSibling?: any;
  isSiblingAfterSomething?: any;
}> & { isAdjacentSibling?: boolean; isSiblingAfterSomething?: boolean };

function Thing(props: ThingProps) {
  const { children, className, isAdjacentSibling, isSiblingAfterSomething, ...rest } = props;
  return (
    <div
      {...rest}
      {...mergedSx(
        [
          styles.thing,
          isAdjacentSibling && styles.adjacentSibling,
          isSiblingAfterSomething && styles.siblingAfterSomething,
        ],
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
    <Thing isAdjacentSibling>Second (red, lime background - adjacent to first)</Thing>
    <Thing className="something" isAdjacentSibling>
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

const styles = stylex.create({
  adjacentSibling: {
    color: "red",
    backgroundColor: "lime",
  },
  siblingAfterSomething: {
    backgroundColor: "yellow",
  },
  thing: {
    color: "blue",
  },
});

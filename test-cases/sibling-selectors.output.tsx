import * as stylex from "@stylexjs/stylex";

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

function Thing(props) {
  const { children, className, isAdjacentSibling, isSiblingAfterSomething, ...rest } = props;

  const sx = stylex.props(
    styles.thing,
    isAdjacentSibling && styles.adjacentSibling,
    isSiblingAfterSomething && styles.siblingAfterSomething,
  );

  return (
    <div {...sx} className={[sx.className, className].filter(Boolean).join(" ")} {...rest}>
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

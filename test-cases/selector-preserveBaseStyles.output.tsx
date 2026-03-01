import * as stylex from "@stylexjs/stylex";

export function App() {
  return (
    <div {...stylex.props(styles.parent, stylex.defaultMarker())}>
      <div {...stylex.props(styles.child, styles.childInParent)}>child</div>
    </div>
  );
}

const styles = stylex.create({
  child: {
    color: "red",
  },
  parent: {
    width: "123px",
    height: "45px",
    opacity: 0.8,
    transform: "scale(1)",
  },
  childInParent: {
    color: "blue",
  },
});

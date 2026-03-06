import * as stylex from "@stylexjs/stylex";

export function App() {
  return (
    <div sx={[styles.parent, stylex.defaultMarker()]}>
      <div sx={[styles.child, styles.childInParent]}>child</div>
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

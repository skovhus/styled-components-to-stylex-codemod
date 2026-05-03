import * as stylex from "@stylexjs/stylex";

export const App = () => (
  <div tabIndex={0} sx={styles.thing}>
    Hover or focus me!
  </div>
);

const styles = stylex.create({
  thing: {
    borderRightWidth: 1,
    borderRightStyle: "solid",
    borderRightColor: "hotpink",
    color: {
      default: "blue",
      ":hover": "red",
    },
    display: "inline-block",
    padding: 12,
    outline: {
      default: null,
      ":focus": "2px solid blue",
    },
    "::before": {
      content: '"🔥"',
    },
  },
});

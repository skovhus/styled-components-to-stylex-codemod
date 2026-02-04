import * as stylex from "@stylexjs/stylex";

export const App = () => <div {...stylex.props(styles.thing)}>Hover me!</div>;

const styles = stylex.create({
  thing: {
    borderRightWidth: "1px",
    borderRightStyle: "solid",
    borderRightColor: "hotpink",

    color: {
      default: "blue",
      ":hover": "red",
    },
    outline: {
      default: null,
      ":focus": "2px solid blue",
    },
    "::before": {
      content: '"🔥"',
    },
  },
});

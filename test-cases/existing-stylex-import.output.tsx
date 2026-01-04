import * as stylex from "@stylexjs/stylex";

const styles = stylex.create({
  title: {
    fontSize: "1.5em",
    textAlign: "center",
    color: "#BF4F74",
  },
});

export const App = () => <h1 {...stylex.props(styles.title)}>Hello World!</h1>;

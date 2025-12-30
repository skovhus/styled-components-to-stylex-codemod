import * as stylex from "@stylexjs/stylex";

const styles = stylex.create({
  title: {
    fontSize: "1.5em",
    textAlign: "center",
    color: "#BF4F74",
  },
  wrapper: {
    padding: "4em",
    backgroundColor: "papayawhip",
  },
});

export const App = () => (
  <section {...stylex.props(styles.wrapper)}>
    <h1 {...stylex.props(styles.title)}>Hello World!</h1>
  </section>
);

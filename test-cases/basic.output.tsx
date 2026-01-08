import * as stylex from "@stylexjs/stylex";

export const App = () => (
  <section {...stylex.props(styles.wrapper)}>
    <h1 {...stylex.props(styles.title)}>Hello World!</h1>
  </section>
);

const styles = stylex.create({
  /**
   * Page title with brand color styling.
   */
  title: {
    fontSize: "1.5em",
    textAlign: "center",
    color: "#BF4F74",
  },

  // Page wrapper with padding
  wrapper: {
    padding: "4em",
    backgroundColor: "papayawhip",
  },
});

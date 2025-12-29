import * as stylex from "@stylexjs/stylex";

const truncate = {
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
} as const;

const styles = stylex.create({
  title: {
    ...truncate,
    fontSize: "1.5em",
    color: "#BF4F74",
  },
  subtitle: {
    ...truncate,
    fontSize: "1em",
    color: "#666",
  },
});

export const App = () => (
  <div>
    <h1 {...stylex.props(styles.title)}>This is a very long title that will be truncated</h1>
    <h2 {...stylex.props(styles.subtitle)}>This is a subtitle that will also be truncated</h2>
  </div>
);

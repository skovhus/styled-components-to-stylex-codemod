import * as stylex from "@stylexjs/stylex";

export function App() {
  return <div {...stylex.props(styles.container)}>Flex content</div>;
}

const styles = stylex.create({
  container: {
    display: "flex",
    flexDirection: "column",
    gap: "16px",
    padding: "8px",
    backgroundColor: "white",
  },
});

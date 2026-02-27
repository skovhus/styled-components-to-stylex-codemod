import * as stylex from "@stylexjs/stylex";

export function App() {
  return <div {...stylex.props(styles.container)}>No attrs</div>;
}

const styles = stylex.create({
  container: {
    display: "flex",
    padding: "10px",
    backgroundColor: "#eef9ff",
    borderWidth: "1px",
    borderStyle: "solid",
    borderColor: "#5aa",
  },
});

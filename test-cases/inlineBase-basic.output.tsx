import * as stylex from "@stylexjs/stylex";

export function App() {
  return <div {...stylex.props(styles.container)}>Basic</div>;
}

const styles = stylex.create({
  container: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: "16px",
    padding: "8px",
    backgroundColor: "#f5f5ff",
    borderWidth: "1px",
    borderStyle: "solid",
    borderColor: "#667",
  },
});

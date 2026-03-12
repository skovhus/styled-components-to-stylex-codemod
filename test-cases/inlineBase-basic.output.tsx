import * as stylex from "@stylexjs/stylex";

export function App() {
  return <div sx={styles.container}>Basic</div>;
}

const styles = stylex.create({
  container: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 16,
    padding: 8,
    backgroundColor: "#f5f5ff",
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: "#667",
  },
});

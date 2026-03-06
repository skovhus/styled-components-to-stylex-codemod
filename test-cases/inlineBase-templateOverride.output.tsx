import * as stylex from "@stylexjs/stylex";

export function App() {
  return <div sx={styles.container}>Override</div>;
}

const styles = stylex.create({
  container: {
    display: "grid",
    flexDirection: "row",
    gap: "4px",
    padding: "8px",
    backgroundColor: "#eef",
  },
});

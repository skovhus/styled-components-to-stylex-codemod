import * as stylex from "@stylexjs/stylex";

export function App() {
  return <div sx={styles.container}>No attrs</div>;
}

const styles = stylex.create({
  container: {
    display: "flex",
    flexDirection: "row",
    padding: 10,
    backgroundColor: "#eef9ff",
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: "#5aa",
  },
});

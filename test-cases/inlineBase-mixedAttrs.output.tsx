import * as stylex from "@stylexjs/stylex";

export function App() {
  return (
    <div data-testid="mixed-inline-base" role="region" id="mixed-box" sx={styles.container}>
      Mixed attrs
    </div>
  );
}

const styles = stylex.create({
  container: {
    display: "flex",
    flexDirection: "column",
    padding: 8,
    backgroundColor: "#fff4e6",
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: "#b97",
  },
});

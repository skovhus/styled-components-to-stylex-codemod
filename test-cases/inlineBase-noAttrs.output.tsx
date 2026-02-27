import * as stylex from "@stylexjs/stylex";

export function App() {
  return <div {...stylex.props(styles.container)}>Default flex</div>;
}

const styles = stylex.create({
  container: {
    display: "flex",
    padding: "12px",
    borderWidth: "1px",
    borderStyle: "solid",
    borderColor: "gray",
  },
});

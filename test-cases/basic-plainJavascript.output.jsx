import * as stylex from "@stylexjs/stylex";

export const App = () => (
  <div>
    <button sx={styles.button}>Click me</button>
    <div sx={styles.card}>Card content</div>
  </div>
);

const styles = stylex.create({
  button: {
    backgroundColor: "#bf4f74",
    color: "white",
    paddingTop: 8,
    paddingRight: 16,
    paddingBottom: 8,
    paddingLeft: 16,
    borderWidth: 0,
    borderStyle: "none",
    borderColor: "initial",
    borderRadius: 4,
  },
  card: {
    paddingTop: 16,
    paddingRight: 12,
    paddingBottom: 16,
    paddingLeft: 12,
    backgroundColor: "white",
    borderRadius: 8,
  },
});

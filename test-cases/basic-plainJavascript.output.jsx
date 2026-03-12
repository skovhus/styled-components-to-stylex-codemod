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
    paddingBlock: 8,
    paddingInline: 16,
    borderWidth: 0,
    borderStyle: "none",
    borderColor: "initial",
    borderRadius: 4,
  },
  card: {
    paddingBlock: 16,
    paddingInline: 12,
    backgroundColor: "white",
    borderRadius: 8,
  },
});

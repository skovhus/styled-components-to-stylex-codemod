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
    paddingBlock: "8px",
    paddingInline: "16px",
    borderWidth: 0,
    borderStyle: "none",
    borderColor: "initial",
    borderRadius: "4px",
  },
  card: {
    paddingBlock: "16px",
    paddingInline: "12px",
    backgroundColor: "white",
    borderRadius: "8px",
  },
});

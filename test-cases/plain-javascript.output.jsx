import * as stylex from "@stylexjs/stylex";

export const App = () => (
  <div>
    <button {...stylex.props(styles.button)}>Click me</button>
    <div {...stylex.props(styles.card)}>Card content</div>
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
    borderRadius: "4px",
  },
  card: {
    paddingBlock: "16px",
    paddingInline: "12px",
    backgroundColor: "white",
    borderRadius: "8px",
  },
});

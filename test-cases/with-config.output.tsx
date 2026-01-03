import * as stylex from "@stylexjs/stylex";

const styles = stylex.create({
  button: {
    backgroundColor: "#BF4F74",
    color: "white",
    padding: "8px 16px",
    borderWidth: 0,
    borderStyle: "none",
    borderRadius: "4px",
  },
  card: {
    padding: "16px",
    backgroundColor: "white",
    borderRadius: "8px",
    boxShadow: "0 2px 4px rgba(0, 0, 0, 0.1)",
  },
  input: {
    padding: "8px 12px",
    borderWidth: "2px",
    borderStyle: "solid",
    borderColor: "#BF4F74",
    borderRadius: "4px",
    fontSize: "14px",
    outline: {
      default: null,
      ":focus": "none",
    },
    border: "#ccc",
  },
  inputHasError: {
    border: "red",
    borderColor: "red",
  },
  baseButton: {
    fontSize: "14px",
    cursor: "pointer",
  },
  extendedButton: {
    backgroundColor: "#4F74BF",
    color: "white",
    padding: "8px 16px",
    borderWidth: 0,
    borderStyle: "none",
    borderRadius: "4px",
  },
});

export const App = () => (
  <div>
    <button {...stylex.props(styles.button)}>Primary Button</button>
    <div {...stylex.props(styles.card)}>
      <p>Card content</p>
    </div>
    <input placeholder="Normal input" {...stylex.props(styles.input)} />
    <input hasError placeholder="Error input" {...stylex.props(styles.input)} />
    <button {...stylex.props(styles.baseButton, styles.extendedButton)}>Extended Button</button>
  </div>
);

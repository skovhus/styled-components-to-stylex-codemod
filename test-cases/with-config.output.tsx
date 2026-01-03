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
    borderColor: {
      default: "#ccc",
      ":focus": "#BF4F74",
    },
    borderRadius: "4px",
    fontSize: "14px",
    outline: {
      default: null,
      ":focus": "none",
    },
  },
  inputHasError: {
    borderColor: {
      default: "red",
      ":focus": "red",
    },
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

function Input(props) {
  const { className, style, hasError, ...rest } = props;

  const sx = stylex.props(styles.input, hasError && styles.inputHasError);

  return (
    <input
      {...sx}
      className={[sx.className, className].filter(Boolean).join(" ")}
      style={style}
      {...rest}
    />
  );
}

export const App = () => (
  <div>
    <button {...stylex.props(styles.button)}>Primary Button</button>
    <div {...stylex.props(styles.card)}>
      <p>Card content</p>
    </div>
    <Input placeholder="Normal input" />
    <Input hasError placeholder="Error input" />
    <button {...stylex.props(styles.baseButton, styles.extendedButton)}>Extended Button</button>
  </div>
);

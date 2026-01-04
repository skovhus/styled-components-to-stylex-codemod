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

  // Combining withConfig options
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

// withConfig for displayName (debugging)
function Button(props) {
  const { className, children, style, ...rest } = props;

  const sx = stylex.props(styles.button);

  return (
    <button
      {...sx}
      className={[sx.className, className].filter(Boolean).join(" ")}
      style={{ ...sx.style, ...style }}
      {...rest}
    >
      {children}
    </button>
  );
}
Button.displayName = "PrimaryButton";
// withConfig for componentId (stable class names)
function Card(props) {
  const { className, children, style, ...rest } = props;

  const sx = stylex.props(styles.card);

  return (
    <div
      {...sx}
      className={[sx.className, className].filter(Boolean).join(" ")}
      style={{ ...sx.style, ...style }}
      {...rest}
    >
      {children}
    </div>
  );
}
Card.displayName = "Card";
function Input(props) {
  const { className, style, hasError, ...rest } = props;

  const sx = stylex.props(styles.input, hasError && styles.inputHasError);

  return (
    <input
      {...sx}
      className={[sx.className, className].filter(Boolean).join(" ")}
      style={{ ...sx.style, ...style }}
      {...rest}
    />
  );
}
Input.displayName = "StyledInput";
function ExtendedButton(props) {
  const { className, children, style, ...rest } = props;

  const sx = stylex.props(styles.baseButton, styles.extendedButton);

  return (
    <button
      {...sx}
      className={[sx.className, className].filter(Boolean).join(" ")}
      style={{ ...sx.style, ...style }}
      {...rest}
    >
      {children}
    </button>
  );
}
ExtendedButton.displayName = "ExtendedButton";

export const App = () => (
  <div>
    <Button>Primary Button</Button>
    <Card>
      <p>Card content</p>
    </Card>
    <Input placeholder="Normal input" />
    <Input hasError placeholder="Error input" />
    <ExtendedButton>Extended Button</ExtendedButton>
  </div>
);

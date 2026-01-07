import * as stylex from "@stylexjs/stylex";

const styles = stylex.create({
  // withConfig for displayName (debugging)
  button: {
    backgroundColor: "#BF4F74",
    color: "white",
    padding: "8px 16px",
    borderWidth: 0,
    borderStyle: "none",
    borderRadius: "4px",
  },

  // withConfig for componentId (stable class names)
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

  // withConfig on extended components
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

function Button(props) {
  return <button {...stylex.props(styles.button)}>{props.children}</button>;
}

Button.displayName = "PrimaryButton";

function Card(props) {
  return <div {...stylex.props(styles.card)}>{props.children}</div>;
}

Card.displayName = "Card";

function Input(props) {
  const { hasError } = props;

  return <input {...stylex.props(styles.input, hasError && styles.inputHasError)} />;
}

Input.displayName = "StyledInput";

function ExtendedButton(props) {
  return (
    <button {...stylex.props(styles.baseButton, styles.extendedButton)}>{props.children}</button>
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

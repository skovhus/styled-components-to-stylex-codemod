import * as React from "react";
import * as stylex from "@stylexjs/stylex";

type CardProps = React.PropsWithChildren<{}>;

// withConfig for componentId (stable class names)
function Card(props: CardProps) {
  return <div sx={styles.card}>{props.children}</div>;
}

type InputProps = { hasError?: boolean } & Pick<React.ComponentProps<"input">, "placeholder">;

// Combining withConfig options
function Input(props: InputProps) {
  const { hasError, ...rest } = props;
  return <input {...rest} sx={[styles.input, hasError && styles.inputHasError]} />;
}

export const App = () => (
  <div>
    <button sx={styles.button}>Primary Button</button>
    <Card>
      <p>Card content</p>
    </Card>
    <Input placeholder="Normal input" />
    <Input hasError placeholder="Error input" />
    <button sx={[styles.baseButton, styles.extendedButton]}>Extended Button</button>
  </div>
);

const styles = stylex.create({
  // withConfig for displayName (debugging)
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
    padding: 16,
    backgroundColor: "white",
    borderRadius: 8,
    boxShadow: "0 2px 4px rgba(0, 0, 0, 0.1)",
  },
  input: {
    paddingBlock: 8,
    paddingInline: 12,
    borderWidth: "2px",
    borderStyle: "solid",
    borderColor: {
      default: "#ccc",
      ":focus": "#BF4F74",
    },
    borderRadius: 4,
    fontSize: 14,
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
    fontSize: 14,
    cursor: "pointer",
  },
  extendedButton: {
    backgroundColor: "#4f74bf",
    color: "white",
    paddingBlock: 8,
    paddingInline: 16,
    borderWidth: 0,
    borderStyle: "none",
    borderColor: "initial",
    borderRadius: 4,
  },
});

import * as React from "react";
import * as stylex from "@stylexjs/stylex";

type CardProps = React.PropsWithChildren<{}>;

// withConfig for componentId (stable class names)
function Card(props: CardProps) {
  const { children } = props;
  return <div {...stylex.props(styles.card)}>{children}</div>;
}

type InputProps = Omit<React.ComponentProps<"input">, "style" | "className"> & {
  hasError?: boolean;
};

// Combining withConfig options
function Input(props: InputProps) {
  const { hasError, ...rest } = props;
  return <input {...rest} {...stylex.props(styles.input, hasError && styles.inputHasError)} />;
}

export const App = () => (
  <div>
    <button {...stylex.props(styles.button)}>Primary Button</button>
    <Card>
      <p>Card content</p>
    </Card>
    <Input placeholder="Normal input" />
    <Input hasError placeholder="Error input" />
    <button {...stylex.props(styles.baseButton, styles.extendedButton)}>Extended Button</button>
  </div>
);

const styles = stylex.create({
  // withConfig for displayName (debugging)
  button: {
    backgroundColor: "#BF4F74",
    color: "white",
    paddingBlock: "8px",
    paddingInline: "16px",
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
    paddingBlock: "8px",
    paddingInline: "12px",
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
    paddingBlock: "8px",
    paddingInline: "16px",
    borderWidth: 0,
    borderStyle: "none",
    borderRadius: "4px",
  },
});

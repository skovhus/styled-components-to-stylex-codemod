import * as React from "react";
import * as stylex from "@stylexjs/stylex";

type ButtonProps = React.PropsWithChildren<{
  $primary?: boolean;
}>;

function Button(props: ButtonProps) {
  const { children, $primary } = props;
  return (
    <button {...stylex.props(styles.button, $primary && styles.buttonPrimary)}>{children}</button>
  );
}

export const App = () => (
  <div>
    <Button>Normal</Button>
    <Button $primary>Primary</Button>
  </div>
);

const styles = stylex.create({
  button: {
    backgroundColor: "white",
    color: "#BF4F74",
    fontSize: "1em",
    margin: "1em",
    padding: "0.25em 1em",
    borderWidth: "2px",
    borderStyle: "solid",
    borderColor: "#BF4F74",
    borderRadius: "3px",
  },
  buttonPrimary: {
    backgroundColor: "#BF4F74",
    color: "white",
  },
});

import React from "react";
import * as stylex from "@stylexjs/stylex";

const styles = stylex.create({
  button: {
    display: "inline-block",
    padding: "8px 16px",
    backgroundColor: "#BF4F74",
    color: "white",
    borderWidth: 0,
    borderStyle: "none",
    borderRadius: "4px",
    textDecoration: "none",
    cursor: "pointer",
  },

  // Wrapper that always renders as a specific element but passes `as` through
  buttonWrapper: {
    boxShadow: "0 2px 4px rgba(0, 0, 0, 0.2)",
  },
});

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  as?: React.ElementType;
  href?: string;
}

function Button({
  as: Component = "button",
  children,
  ...props
}: ButtonProps & { children?: React.ReactNode }) {
  return (
    <Component {...stylex.props(styles.button)} {...props}>
      {children}
    </Component>
  );
}

function ButtonWrapper({
  as: Component = "button",
  children,
  ...props
}: ButtonProps & { children?: React.ReactNode }) {
  return (
    <Component {...stylex.props(styles.button, styles.buttonWrapper)} {...props}>
      {children}
    </Component>
  );
}

export const App = () => (
  <div>
    <Button>Regular Button</Button>
    <Button as="a" href="#">
      Button as Link
    </Button>
    <ButtonWrapper as="a" href="#">
      Wrapper forwards as Link
    </ButtonWrapper>
  </div>
);

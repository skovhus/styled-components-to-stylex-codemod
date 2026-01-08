import * as React from "react";
import * as stylex from "@stylexjs/stylex";

type ButtonProps = React.ComponentProps<"button"> & { as?: React.ElementType; href?: string };

function Button(props: ButtonProps) {
  const { as: Component = "button", children, ...rest } = props;
  return (
    <Component {...stylex.props(styles.button)} {...rest}>
      {children}
    </Component>
  );
}

type ButtonWrapperProps = React.ComponentProps<"button"> & {
  as?: React.ElementType;
  href?: string;
};

function ButtonWrapper(props: ButtonWrapperProps) {
  const { as: Component = "button", children, ...rest } = props;
  return (
    <Component {...stylex.props(styles.button, styles.buttonWrapper)} {...rest}>
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

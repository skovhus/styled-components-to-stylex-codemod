import * as React from "react";
import * as stylex from "@stylexjs/stylex";
import { mergedSx } from "./lib/mergedSx";

type ButtonProps<C extends React.ElementType = "button"> = Omit<
  React.ComponentPropsWithoutRef<C>,
  "style"
> & { as?: C };

function Button<C extends React.ElementType = "button">(props: ButtonProps<C>) {
  const { as: Component = "button", className, children, ...rest } = props;
  return (
    <Component {...rest} {...mergedSx(styles.button, className)}>
      {children}
    </Component>
  );
}

type ButtonWrapperProps = Omit<React.ComponentPropsWithRef<typeof Button>, "className" | "style">;

// Wrapper that always renders as a specific element but passes `as` through
function ButtonWrapper(props: ButtonWrapperProps) {
  return <Button {...props} {...stylex.props(styles.buttonWrapper)} />;
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
    paddingBlock: "8px",
    paddingInline: "16px",
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

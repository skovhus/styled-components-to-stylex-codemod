import * as stylex from "@stylexjs/stylex";
import React, { useCallback, useEffect } from "react";

interface ButtonProps {
  variant: "primary" | "secondary";
}

// This styled component has props which will generate React.PropsWithChildren
function Button(props: Omit<React.ComponentProps<"button">, "className" | "style"> & ButtonProps) {
  const { children, variant } = props;

  return (
    <button {...stylex.props(styles.button, variant === "primary" && styles.buttonVariantPrimary)}>
      {children}
    </button>
  );
}

export const App = () => {
  const handleClick = useCallback(() => {
    console.log("clicked");
  }, []);

  useEffect(() => {
    console.log("mounted");
  }, []);

  return (
    <div onClick={handleClick} {...stylex.props(styles.card)}>
      <Button variant="primary">Click me</Button>
    </div>
  );
};

const styles = stylex.create({
  // This component has a named React import but no default/namespace import
  // When transformed, if it needs React (e.g., React.PropsWithChildren),
  // it should add React to the existing import, not create a duplicate
  card: {
    padding: "16px",
    backgroundColor: "white",
    backgroundImage: "none",
  },
  button: {
    paddingBlock: "8px",
    paddingInline: "16px",
    backgroundColor: "gray",
    color: "white",
  },
  buttonVariantPrimary: {
    backgroundColor: "blue",
  },
});

import * as stylex from "@stylexjs/stylex";
import React from "react";

// Styled-components version of the StyleX "variants" recipe:
// https://stylexjs.com/docs/learn/recipes/variants

type Props = {
  color?: "primary" | "secondary";
  size?: "small" | "medium";
  disabled?: boolean;
};

type ButtonProps = React.PropsWithChildren<Props>;

function Button(props: ButtonProps) {
  const { children, color, size, ...rest } = props;
  return (
    <button
      {...rest}
      {...stylex.props(
        styles.button,
        color === "primary" && styles.buttonColorPrimary,
        size === "medium" && styles.buttonSizeMedium,
      )}
    >
      {children}
    </button>
  );
}

export function App() {
  return (
    <div>
      <Button color="primary" size="medium">
        Primary
      </Button>
      <Button color="secondary">Secondary</Button>
      <Button color="primary" size="medium" disabled>
        Disabled
      </Button>
    </div>
  );
}

const styles = stylex.create({
  button: {
    appearance: "none",
    borderWidth: 0,
    backgroundColor: "gray",
    color: "white",
    fontSize: "1rem",
    padding: "4px 8px",
  },
  buttonColorPrimary: {
    backgroundColor: "blue",
  },
  buttonSizeMedium: {
    fontSize: "1.2rem",
    padding: "8px 16px",
  },
});

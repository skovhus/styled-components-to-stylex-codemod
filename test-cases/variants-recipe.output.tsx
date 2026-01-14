import React from "react";
import * as stylex from "@stylexjs/stylex";

// Styled-components version of the StyleX "variants" recipe:
// https://stylexjs.com/docs/learn/recipes/variants

type Props = {
  color?: "primary" | "secondary";
  size?: "small" | "medium";
  disabled?: boolean;
};

type ButtonProps = Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "className" | "style"> &
  Props;

function Button(props: ButtonProps) {
  const { children, color, size, disabled } = props;
  return (
    <button
      disabled={disabled}
      {...stylex.props(
        styles.button,
        color === "primary" && styles.buttonColorPrimary,
        size === "medium" && styles.buttonSizeMedium,
        disabled && styles.buttonDisabled,
        disabled && color === "primary" && styles.buttonDisabledColorPrimary,
        disabled && color !== "primary" && styles.buttonDisabledColorNotPrimary,
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
    backgroundColor: {
      default: "gray",
      ":hover": "darkgray",
    },
    color: "white",
    fontSize: "1rem",
    padding: "4px 8px",
  },
  buttonColorPrimary: {
    backgroundColor: {
      default: "blue",
      ":hover": "darkblue",
    },
  },
  buttonSizeMedium: {
    fontSize: "1.2rem",
    padding: "8px 16px",
  },
  buttonDisabled: {
    color: "rgb(204, 204, 204)",
    cursor: "not-allowed",
  },
  buttonDisabledColorPrimary: {
    color: "rgb(204, 204, 204)",
    cursor: "not-allowed",
    backgroundColor: {
      default: "grey",
      ":hover": "darkblue",
    },
  },
  buttonDisabledColorNotPrimary: {
    color: "rgb(204, 204, 204)",
    cursor: "not-allowed",
    backgroundColor: {
      default: "grey",
      ":hover": "darkgray",
    },
  },
});

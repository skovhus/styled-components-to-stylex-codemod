import React from "react";
import * as stylex from "@stylexjs/stylex";

// Styled-components version of the StyleX "variants" recipe:
// https://stylexjs.com/docs/learn/recipes/variants

type Props = {
  color?: "primary" | "secondary";
  size?: "small" | "medium";
  disabled?: boolean;
};

type ButtonProps = Omit<React.ComponentProps<"button">, "className" | "style"> & Props;

function Button(props: ButtonProps) {
  const { children, size: size = "small", color: color = "secondary", disabled } = props;
  return (
    <button
      disabled={disabled}
      {...stylex.props(
        styles.button,
        sizeVariants[size],
        disabled ? colorDisabledVariants[color] : colorEnabledVariants[color],
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
    color: "white",
    fontSize: "1rem",
    paddingBlock: "4px",
    paddingInline: "8px",
  },
});

const colorEnabledVariants = stylex.create({
  primary: {
    backgroundColor: {
      default: "blue",
      ":hover": "darkblue",
    },
  },
  secondary: {
    backgroundColor: {
      default: "gray",
      ":hover": "darkgray",
    },
  },
});

const colorDisabledVariants = stylex.create({
  primary: {
    backgroundColor: {
      default: "grey",
      ":hover": "darkblue",
    },
    color: "rgb(204, 204, 204)",
    cursor: "not-allowed",
  },
  secondary: {
    backgroundColor: {
      default: "grey",
      ":hover": "darkgray",
    },
    color: "rgb(204, 204, 204)",
    cursor: "not-allowed",
  },
});

const sizeVariants = stylex.create({
  medium: {
    fontSize: "1.2rem",
    paddingBlock: "8px",
    paddingInline: "16px",
  },
  small: {
    fontSize: "1rem",
    paddingBlock: "4px",
    paddingInline: "8px",
  },
});

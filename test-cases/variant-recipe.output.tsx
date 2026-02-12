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
  const { children, size = "small", color = "secondary", disabled } = props;

  return (
    <button
      disabled={disabled}
      {...stylex.props(
        styles.button,
        sizeVariants[size],
        disabled ? buttonColorDisabledVariants[color] : buttonColorEnabledVariants[color],
      )}
    >
      {children}
    </button>
  );
}

// Second component with same "color" prop but different styles
// This tests that conflicting variant names get per-component prefixes
type LinkProps = Omit<React.ComponentProps<"a">, "className" | "style"> & {
  color?: "primary" | "secondary";
  disabled?: boolean;
};

function Link(props: LinkProps) {
  const { children, disabled, color: color = "secondary", ...rest } = props;

  return (
    <a
      {...rest}
      {...stylex.props(
        styles.link,
        disabled ? linkColorDisabledVariants[color] : linkColorEnabledVariants[color],
      )}
    >
      {children}
    </a>
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
      <Link color="primary" href="#">
        Primary Link
      </Link>
      <Link color="secondary" href="#">
        Secondary Link
      </Link>
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
  link: {
    textDecoration: {
      default: "none",
      ":hover": "underline",
    },
  },
});

const buttonColorEnabledVariants = stylex.create({
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

const buttonColorDisabledVariants = stylex.create({
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

const linkColorEnabledVariants = stylex.create({
  primary: {
    color: {
      default: "red",
      ":hover": "darkred",
    },
  },
  secondary: {
    color: {
      default: "green",
      ":hover": "darkgreen",
    },
  },
});

const linkColorDisabledVariants = stylex.create({
  primary: {
    color: {
      default: "grey",
      ":hover": "darkred",
    },
    cursor: "not-allowed",
  },
  secondary: {
    color: {
      default: "grey",
      ":hover": "darkgreen",
    },
    cursor: "not-allowed",
  },
});

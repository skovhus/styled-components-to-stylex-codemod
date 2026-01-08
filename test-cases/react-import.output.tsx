import * as React from "react";
import * as stylex from "@stylexjs/stylex";

type CardProps = React.ComponentProps<"div">;

export function Card(props: CardProps) {
  const { children, style, ...rest } = props;
  return (
    <div {...rest} {...stylex.props(styles.card)} style={style}>
      {children}
    </div>
  );
}

type ButtonProps = React.ComponentProps<"button">;

// Another component to ensure multiple components work
export function Button(props: ButtonProps) {
  const { children, style, ...rest } = props;
  return (
    <button {...rest} {...stylex.props(styles.button)} style={style}>
      {children}
    </button>
  );
}

export function App() {
  return null;
}

// Bug 11: When the original file has no React import (relying on JSX transform),
// the codemod generates a wrapper function with JSX but forgets to add React import.
// This causes: "'React' refers to a UMD global, but the current file is a module"

// This component uses JSX but has no explicit React import
// (modern JSX transform doesn't require it for styled-components)
const styles = stylex.create({
  card: {
    padding: "16px",
    backgroundColor: "white",
  },
  button: {
    padding: "8px 16px",
    backgroundColor: "blue",
    color: "white",
  },
});

import * as stylex from "@stylexjs/stylex";
import * as React from "react";

// Bug 11: When the original file has no React import (relying on JSX transform),
// the codemod generates a wrapper function with JSX but forgets to add React import.
// This causes: "'React' refers to a UMD global, but the current file is a module"

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

type CardProps = React.ComponentProps<"div">;

// This component uses JSX but has no explicit React import
// (modern JSX transform doesn't require it for styled-components)
export function Card(props: CardProps) {
  const { style, ...rest } = props;
  return <div {...rest} {...stylex.props(styles.card)} style={style} />;
}

type ButtonProps = React.ComponentProps<"button">;

// Another component to ensure multiple components work
export function Button(props: ButtonProps) {
  const { style, ...rest } = props;
  return <button {...rest} {...stylex.props(styles.button)} style={style} />;
}

export function App() {
  return null;
}

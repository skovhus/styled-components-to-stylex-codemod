import * as React from "react";
import * as stylex from "@stylexjs/stylex";
import { themeVars } from "./tokens.stylex";

type CardProps = Omit<React.ComponentProps<"div">, "className" | "style">;

export function Card(props: CardProps) {
  const { children, ...rest } = props;
  return (
    <div {...rest} {...stylex.props(styles.card)}>
      {children}
    </div>
  );
}

type ButtonProps = Omit<React.ComponentProps<"button">, "className" | "style">;

// Another component to ensure multiple components work
export function Button(props: ButtonProps) {
  const { children, ...rest } = props;
  return (
    <button {...rest} {...stylex.props(styles.button)}>
      {children}
    </button>
  );
}

// Pattern 2: Component with theme access (like TextColor.tsx in a design system)
// Uses props.theme.colors which the adapter resolves to themeVars
interface ThemeSpanProps extends Omit<React.ComponentProps<"span">, "className" | "style"> {
  variant: string;
}

export function ThemeSpan(props: ThemeSpanProps) {
  const { children, variant, ...rest } = props;

  const sx = stylex.props(styles.themeSpan, variant != null && styles.themeSpanColor(variant));
  return (
    <span {...rest} {...sx}>
      {children}
    </span>
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
  themeSpan: {},
  themeSpanColor: (variant: string) => ({
    color: themeVars[variant],
  }),
});

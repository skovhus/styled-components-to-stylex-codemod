import * as React from "react";
import * as stylex from "@stylexjs/stylex";
import { themeVars } from "./tokens.stylex";

type CardProps = React.PropsWithChildren<{}>;

export function Card(props: CardProps) {
  const { children } = props;
  return <div {...stylex.props(styles.card)}>{children}</div>;
}

type ButtonProps = React.PropsWithChildren<{}>;

// Another component to ensure multiple components work
export function Button(props: ButtonProps) {
  const { children } = props;
  return <button {...stylex.props(styles.button)}>{children}</button>;
}

// Pattern 2: Component with theme access (like TextColor.tsx in a design system)
// Uses props.theme.color which the adapter resolves to themeVars
interface ThemeSpanProps extends Omit<React.ComponentProps<"span">, "className" | "style"> {
  variant: "labelBase" | "labelMuted" | "labelTitle";
}

export function ThemeSpan(props: ThemeSpanProps) {
  const { children, variant } = props;

  const sx = stylex.props(styles.themeSpan, styles.themeSpanColor(variant));
  return <span {...sx}>{children}</span>;
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
  themeSpanColor: (variant: "labelBase" | "labelMuted" | "labelTitle") => ({
    color: themeVars[variant],
  }),
});

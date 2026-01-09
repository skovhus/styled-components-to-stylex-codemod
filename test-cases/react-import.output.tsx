import * as React from "react";
import * as stylex from "@stylexjs/stylex";
import { themeVars } from "./tokens.stylex";

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

// Pattern 2: Component with theme access (like TextColor.tsx in a design system)
// Uses props.theme.colors which the adapter resolves to themeVars
interface ThemeSpanProps extends React.ComponentProps<"span"> {
  variant: string;
}

export function ThemeSpan(props: ThemeSpanProps) {
  const { children, className, style, variant, ...rest } = props;

  const sx = stylex.props(styles.themeSpan, variant != null && styles.themeSpanColor(variant));
  return (
    <span
      {...sx}
      className={[sx.className, className].filter(Boolean).join(" ")}
      style={{
        ...sx.style,
        ...style,
      }}
      {...rest}
    >
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

import * as React from "react";
import * as stylex from "@stylexjs/stylex";
import { $colors } from "./tokens.stylex";

type CardProps = React.PropsWithChildren<{
  ref?: React.Ref<HTMLDivElement>;
}>;

// This component uses JSX but has no explicit React import
// (modern JSX transform doesn't require it for styled-components)
export function Card(props: CardProps) {
  const { children } = props;
  return <div {...stylex.props(styles.card)}>{children}</div>;
}

type ButtonProps = React.PropsWithChildren<{
  ref?: React.Ref<HTMLButtonElement>;
}>;

// Another component to ensure multiple components work
export function Button(props: ButtonProps) {
  const { children } = props;
  return <button {...stylex.props(styles.button)}>{children}</button>;
}

// Pattern 2: Component with theme access (like TextColor.tsx in a design system)
// Uses props.theme.color which the adapter resolves to $colors
interface ThemeSpanProps extends Omit<React.ComponentProps<"span">, "style" | "className"> {
  variant: "labelBase" | "labelMuted" | "labelTitle";
}

export function ThemeSpan(props: ThemeSpanProps) {
  const { children, variant } = props;
  return <span {...stylex.props(styles.themeSpanColor(variant))}>{children}</span>;
}

export function App() {
  return null;
}

const styles = stylex.create({
  card: {
    padding: "16px",
    backgroundColor: "white",
  },
  button: {
    paddingBlock: "8px",
    paddingInline: "16px",
    backgroundColor: "blue",
    color: "white",
  },
  themeSpanColor: (variant: "labelBase" | "labelMuted" | "labelTitle") => ({
    color: $colors[variant],
  }),
});

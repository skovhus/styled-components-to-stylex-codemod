import * as React from "react";
import * as stylex from "@stylexjs/stylex";
import { $colors } from "./tokens.stylex";

// This component uses JSX but has no explicit React import
// (modern JSX transform doesn't require it for styled-components)
export function Card(props: React.PropsWithChildren<{ ref?: React.Ref<HTMLDivElement> }>) {
  const { children, ...rest } = props;

  return (
    <div {...rest} {...stylex.props(styles.card)}>
      {children}
    </div>
  );
}

// Another component to ensure multiple components work
export function Button(props: React.PropsWithChildren<{ ref?: React.Ref<HTMLButtonElement> }>) {
  const { children, ...rest } = props;

  return (
    <button {...rest} {...stylex.props(styles.button)}>
      {children}
    </button>
  );
}

// Pattern 2: Component with theme access (like TextColor.tsx in a design system)
// Uses props.theme.color which the adapter resolves to $colors
interface ThemeSpanProps extends Omit<React.ComponentProps<"span">, "className" | "style"> {
  variant: "labelBase" | "labelMuted" | "labelTitle";
}

export function ThemeSpan(props: ThemeSpanProps) {
  const { children, variant, ...rest } = props;

  return (
    <span {...rest} {...stylex.props(styles.themeSpanColor(variant))}>
      {children}
    </span>
  );
}

export function App() {
  return null;
}

const styles = stylex.create({
  card: {
    padding: "16px",
    backgroundColor: "white",
    backgroundImage: "none",
  },
  button: {
    paddingBlock: "8px",
    paddingInline: "16px",
    backgroundColor: "blue",
    backgroundImage: "none",
    color: "white",
  },
  themeSpanColor: (variant: "labelBase" | "labelMuted" | "labelTitle") => ({
    color: $colors[variant],
  }),
});

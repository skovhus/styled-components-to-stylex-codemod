import * as React from "react";
import * as stylex from "@stylexjs/stylex";
import { $colors } from "./tokens.stylex";

// This component uses JSX but has no explicit React import
// (modern JSX transform doesn't require it for styled-components)
export function Card(props: Pick<React.ComponentProps<"div">, "ref" | "children">) {
  const { children, ...rest } = props;
  return (
    <div {...rest} sx={styles.card}>
      {children}
    </div>
  );
}

// Another component to ensure multiple components work
export function Button(props: Pick<React.ComponentProps<"button">, "ref" | "children">) {
  const { children, ...rest } = props;
  return (
    <button {...rest} sx={styles.button}>
      {children}
    </button>
  );
}

// Pattern 2: Component with theme access (like TextColor.tsx in a design system)
// Uses props.theme.color which the adapter resolves to $colors
interface ThemeSpanProps {
  variant: "labelBase" | "labelMuted" | "labelTitle";
}

export function ThemeSpan(
  props: ThemeSpanProps & Omit<React.ComponentProps<"span">, "className" | "style">,
) {
  const { children, variant, ...rest } = props;
  return (
    <span {...rest} sx={styles.themeSpanColor(variant)}>
      {children}
    </span>
  );
}

export function App() {
  return null;
}

const styles = stylex.create({
  card: {
    padding: 16,
    backgroundColor: "white",
  },
  button: {
    paddingBlock: 8,
    paddingInline: 16,
    backgroundColor: "blue",
    color: "white",
  },
  themeSpanColor: (variant: "labelBase" | "labelMuted" | "labelTitle") => ({
    color: $colors[variant],
  }),
});

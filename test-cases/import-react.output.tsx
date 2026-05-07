import * as React from "react";
import * as stylex from "@stylexjs/stylex";
import { $colorMixins } from "./lib/colorMixins.stylex";

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
    <span {...rest} {...stylex.props($colorMixins.color[variant])}>
      {children}
    </span>
  );
}

type ChoiceButtonProps = { active: boolean } & React.ComponentProps<"button">;

export function ChoiceButton(
  props: Omit<ChoiceButtonProps, "className" | "style"> &
    Omit<React.ComponentProps<"button">, "className" | "style">,
) {
  const { children, active, ...rest } = props;
  return (
    <button {...rest} sx={[styles.choiceButton, active ? styles.choiceButtonActive : undefined]}>
      {children}
    </button>
  );
}

type LocalChoiceButtonProps = { active: boolean } & React.ComponentProps<"button">;

function LocalChoiceButton(
  props: Omit<LocalChoiceButtonProps, "className" | "style"> &
    Omit<React.ComponentProps<"button">, "className" | "style">,
) {
  const { children, active, ...rest } = props;
  return (
    <button
      {...rest}
      sx={[styles.localChoiceButton, active ? styles.localChoiceButtonActive : undefined]}
    >
      {children}
    </button>
  );
}

export function App() {
  return (
    <div>
      <ChoiceButton active>Active</ChoiceButton>
      <ChoiceButton active={false}>Inactive</ChoiceButton>
      <LocalChoiceButton active onClick={() => undefined}>
        Local active
      </LocalChoiceButton>
    </div>
  );
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
  choiceButton: {
    display: "flex",
    alignItems: "center",
    backgroundColor: "gray",
    color: "white",
  },
  choiceButtonActive: {
    backgroundColor: "navy",
  },
  localChoiceButton: {
    display: "inline-flex",
    alignItems: "center",
    backgroundColor: "silver",
    color: "white",
  },
  localChoiceButtonActive: {
    backgroundColor: "purple",
  },
});

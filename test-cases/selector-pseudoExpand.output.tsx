// Pseudo-expand: merged pseudo style object with conditional hover wrapping
import * as React from "react";
import * as stylex from "@stylexjs/stylex";
import { $interaction } from "./lib/interaction.stylex";

function Button(props: React.PropsWithChildren<{}>) {
  return <button sx={styles.button}>{props.children}</button>;
}

function DisabledAwareButton(props: Omit<React.ComponentProps<"button">, "className" | "style">) {
  const { children, ...rest } = props;
  return (
    <button {...rest} sx={styles.disabledAwareButton}>
      {children}
    </button>
  );
}

export function App() {
  return (
    <div style={{ display: "flex", gap: 16, padding: 16 }}>
      <Button>Default</Button>
      <Button>Hover me</Button>
      <DisabledAwareButton>Enabled</DisabledAwareButton>
      <DisabledAwareButton disabled>Disabled</DisabledAwareButton>
    </div>
  );
}

const styles = stylex.create({
  button: {
    paddingBlock: 8,
    paddingInline: 16,
    backgroundColor: {
      default: "#f0f0f0",
      ":active": "#e0e0e0",
      ":hover": {
        default: "#f0f0f0",
        [$interaction.canHover]: "#e0e0e0",
      },
    },
    color: {
      default: "#333",
      ":active": "#111",
      ":hover": {
        default: "#333",
        [$interaction.canHover]: "#111",
      },
    },
  },
  disabledAwareButton: {
    paddingBlock: 8,
    paddingInline: 16,
    backgroundColor: {
      default: "#f0f0f0",
      ":not(:disabled):active": "#d0d0ff",
      ":not(:disabled):hover": {
        default: "#f0f0f0",
        [$interaction.canHover]: "#d0d0ff",
      },
    },
    color: {
      default: "#333",
      ":not(:disabled):active": "#000",
      ":not(:disabled):hover": {
        default: "#333",
        [$interaction.canHover]: "#000",
      },
    },
  },
});

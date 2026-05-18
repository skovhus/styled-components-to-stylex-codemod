import React from "react";
import * as stylex from "@stylexjs/stylex";
import { $interaction } from "./lib/interaction.stylex";

function Button(props: Omit<React.ComponentProps<"button">, "className" | "style">) {
  const { children, ...rest } = props;
  return (
    <button {...rest} sx={styles.button}>
      {children}
    </button>
  );
}

export const App = () => (
  <div style={{ display: "flex", gap: 12, padding: 16 }}>
    <Button type="button">Enabled</Button>
    <Button type="button" disabled>
      Disabled
    </Button>
  </div>
);

const styles = stylex.create({
  button: {
    display: "inline-flex",
    paddingBlock: 8,
    paddingInline: 12,
    backgroundColor: {
      default: "white",
      ":not(:enabled):active": "#dbeafe",
      ":not(:enabled):hover": {
        default: null,
        [$interaction.canHover]: "#dbeafe",
      },
    },
    color: "#0f172a",
  },
});

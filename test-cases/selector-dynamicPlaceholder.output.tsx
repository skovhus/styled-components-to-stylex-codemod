import React from "react";
import * as stylex from "@stylexjs/stylex";
import { $colors } from "./tokens.stylex";

function Input(props: Pick<React.ComponentProps<"input">, "placeholder">) {
  return <input {...props} {...stylex.props(styles.input)} />;
}

export const App = () => (
  <div style={{ display: "grid", gap: 12, padding: 16 }}>
    <Input placeholder="Muted placeholder" />
    <Input placeholder="Second input" />
  </div>
);

const styles = stylex.create({
  input: {
    padding: "12px",
    borderWidth: "1px",
    borderStyle: "solid",
    borderColor: "#ccc",
    backgroundColor: "white",
    "::placeholder": {
      color: $colors.labelMuted,
    },
  },
});

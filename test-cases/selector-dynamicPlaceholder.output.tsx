import * as stylex from "@stylexjs/stylex";
import { $colors } from "./tokens.stylex";

export const App = () => (
  <div style={{ display: "grid", gap: 12, padding: 16 }}>
    <input placeholder="Muted placeholder" {...stylex.props(styles.input)} />
    <input placeholder="Second input" {...stylex.props(styles.input)} />
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

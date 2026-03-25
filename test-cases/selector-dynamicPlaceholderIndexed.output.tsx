import * as stylex from "@stylexjs/stylex";
import { $colors } from "./tokens.stylex";

type Color = "labelBase" | "labelMuted";

export const App = () => (
  <div style={{ display: "grid", gap: 12, padding: 16 }}>
    <input
      placeholder="Base color"
      sx={styles.input({
        placeholderColor: "labelBase",
      })}
    />
    <input
      placeholder="Muted color"
      sx={styles.input({
        placeholderColor: "labelMuted",
      })}
    />
    <span
      sx={styles.badge({
        indicatorColor: "labelBase",
      })}
    >
      Base
    </span>
    <span
      sx={styles.badge({
        indicatorColor: "labelMuted",
      })}
    >
      Muted
    </span>
  </div>
);

const styles = stylex.create({
  input: (props: { placeholderColor: Color }) => ({
    padding: 12,
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: "#ccc",
    "::placeholder": {
      color: $colors[props.placeholderColor],
    },
  }),
  badge: (props: { indicatorColor: Color }) => ({
    position: "relative",
    paddingBlock: 4,
    paddingInline: 8,
    backgroundColor: "#eee",
    "::after": {
      content: '""',
      display: "block",
      height: 3,
      backgroundColor: $colors[props.indicatorColor],
    },
  }),
});

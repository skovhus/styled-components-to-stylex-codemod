import * as stylex from "@stylexjs/stylex";
import { pixelVars, $colors } from "./tokens.stylex";

export const App = () => (
  <div style={{ padding: "10px" }}>
    <div sx={styles.borderLeft}>Bordered left</div>
    <div sx={styles.border}>Bordered box</div>
  </div>
);

const styles = stylex.create({
  borderLeft: {
    borderLeftWidth: pixelVars.thin,
    borderLeftStyle: "solid",
    borderLeftColor: $colors.labelMuted,
  },
  border: {
    borderWidth: pixelVars.thin,
    borderStyle: "solid",
    borderColor: $colors.labelMuted,
  },
});

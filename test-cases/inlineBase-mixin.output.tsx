import * as stylex from "@stylexjs/stylex";
import { flexStyles } from "./lib/flexStyles.stylex";

export function App() {
  return (
    <div style={{ display: "flex", gap: "12px" }}>
      <div {...stylex.props(flexStyles.flex, styles.button)}>Column Button</div>
    </div>
  );
}

const styles = stylex.create({
  button: {
    flexDirection: "column",
    gap: "16px",
    paddingBlock: "8px",
    paddingInline: "16px",
    backgroundColor: "cornflowerblue",
    color: "white",
    borderRadius: "4px",
  },
});

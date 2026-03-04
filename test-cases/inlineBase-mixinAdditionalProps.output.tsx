import * as stylex from "@stylexjs/stylex";
import { mixins } from "./lib/mixins.stylex";

export function App() {
  return <div {...stylex.props(mixins.flex, styles.button)}>Mixin + props</div>;
}

const styles = stylex.create({
  button: {
    alignItems: "center",
    gap: "12px",
    paddingBlock: "8px",
    paddingInline: "12px",
    backgroundColor: "#ecf2ff",
    borderWidth: "1px",
    borderStyle: "solid",
    borderColor: "#6b7ca8",
    color: "#1f2b43",
  },
});

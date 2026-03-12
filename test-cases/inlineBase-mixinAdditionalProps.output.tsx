import * as stylex from "@stylexjs/stylex";
import { mixins } from "./lib/mixins.stylex";

export function App() {
  return <div sx={[mixins.flex, styles.button]}>Mixin + props</div>;
}

const styles = stylex.create({
  button: {
    alignItems: "center",
    gap: 12,
    paddingBlock: 8,
    paddingInline: 12,
    backgroundColor: "#ecf2ff",
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: "#6b7ca8",
    color: "#1f2b43",
  },
});

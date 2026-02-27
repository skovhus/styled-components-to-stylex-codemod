import * as stylex from "@stylexjs/stylex";
import { inlineBaseMixins } from "./lib/flex-inline-base.stylex";

export function App() {
  return <div {...stylex.props(inlineBaseMixins.flex, styles.container)}>Mixin mode</div>;
}

const styles = stylex.create({
  container: {
    padding: "8px",
    backgroundColor: "#e7fff1",
    borderWidth: "1px",
    borderStyle: "solid",
    borderColor: "#58a06d",
  },
});

import * as stylex from "@stylexjs/stylex";
import { mixins } from "./lib/mixins.stylex";

export function App() {
  return <div sx={[mixins.flex, styles.container]}>Mixin mode</div>;
}

const styles = stylex.create({
  container: {
    padding: 8,
    backgroundColor: "#e7fff1",
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: "#58a06d",
  },
});

import * as stylex from "@stylexjs/stylex";
import { $input } from "./tokens.stylex";

export const App = () => (
  <div style={{ display: "flex", flexDirection: "column", gap: 8, padding: 16 }}>
    <input placeholder="With directional padding" sx={styles.input} />
  </div>
);

const styles = stylex.create({
  input: {
    paddingBlock: $input.inputPaddingBlock,
    paddingLeft: 0,
    paddingRight: $input.inputPaddingInline,
    backgroundColor: "white",
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: "#ccc",
  },
});

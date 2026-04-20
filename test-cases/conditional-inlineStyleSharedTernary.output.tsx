// Inline style object with multiple properties sharing the same ternary condition.
// Should hoist into a static base style + boolean-conditional variant style instead
// of emitting a single dynamic function with N ternary call args.
import * as React from "react";
import * as stylex from "@stylexjs/stylex";

const InputRow = ({ hasRange }: { hasRange: boolean }) => (
  <input
    defaultValue={hasRange ? "hasRange" : "no range"}
    sx={[styles.input, hasRange && styles.inputHasRange]}
  />
);

export const App = () => (
  <div style={{ display: "flex", gap: 8, padding: 16 }}>
    <InputRow hasRange={true} />
    <InputRow hasRange={false} />
  </div>
);

const styles = stylex.create({
  input: {
    fontSize: 14,
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: "#ccc",
    paddingBlock: 4,
    paddingInline: 8,
    width: "100%",
    cursor: "ew-resize",
    textAlign: "left",
  },
  inputHasRange: {
    width: 48,
    cursor: "text",
    textAlign: "right",
  },
});

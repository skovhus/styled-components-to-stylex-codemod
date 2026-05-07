// Directional expansion for opaque shorthand theme tokens
import * as React from "react";
import * as stylex from "@stylexjs/stylex";
import { $input } from "./tokens.stylex";

type PlainInputProps = React.ComponentPropsWithoutRef<"input">;

function PlainInput(props: PlainInputProps) {
  return <input {...props} />;
}

function TokenBorderWrappedInput(
  props: Omit<React.ComponentPropsWithRef<typeof PlainInput>, "className" | "style">,
) {
  return <PlainInput {...props} {...stylex.props(styles.tokenBorderWrappedInput)} />;
}

export const App = () => (
  <div style={{ display: "flex", flexDirection: "column", gap: 8, padding: 16 }}>
    <input placeholder="With directional padding" sx={styles.input} />
    <input placeholder="With token border" sx={styles.tokenBorderInput} />
    <TokenBorderWrappedInput placeholder="Wrapped token border" />
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
  tokenBorderInput: {
    borderWidth: $input.inputBorderWidth,
    borderStyle: $input.inputBorderStyle,
    borderColor: $input.inputBorderColor,
    borderRadius: 4,
    backgroundColor: "white",
  },
  tokenBorderWrappedInput: {
    borderWidth: $input.inputBorderWidth,
    borderStyle: $input.inputBorderStyle,
    borderColor: $input.inputBorderColor,
    borderRadius: 4,
    backgroundColor: "white",
  },
});

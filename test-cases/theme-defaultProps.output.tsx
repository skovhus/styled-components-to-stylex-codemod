import React from "react";
import * as stylex from "@stylexjs/stylex";
import { mergedSx } from "./lib/mergedSx";
import { $colors } from "./tokens.stylex";

function Button(props: React.ComponentProps<"button">) {
  const { className, children, style } = props;

  return <button {...mergedSx(styles.button, className, style)}>{children}</button>;
}

export const App = () => (
  <div style={{ display: "flex", gap: "12px", padding: "12px" }}>
    <Button>Default Props Theme</Button>
  </div>
);

const styles = stylex.create({
  button: {
    paddingBlock: "8px",
    paddingInline: "16px",
    backgroundColor: $colors.bgBase,
    color: "white",
    borderWidth: "2px",
    borderStyle: "solid",
    borderColor: $colors.bgBorderFaint,
  },
});

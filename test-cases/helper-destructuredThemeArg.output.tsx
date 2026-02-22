import React from "react";
import * as stylex from "@stylexjs/stylex";
import { $colors } from "./tokens.stylex";

function Box(props: React.PropsWithChildren<{ ref?: React.Ref<HTMLDivElement> }>) {
  const { children } = props;

  return <div {...stylex.props(styles.box, styles.borderBottom)}>{children}</div>;
}

export const App = () => (
  <div style={{ display: "flex", gap: 16, padding: 16 }}>
    <Box>Box with border</Box>
  </div>
);

const styles = stylex.create({
  box: {
    paddingBlock: "8px",
    paddingInline: "16px",
  },
  borderBottom: {
    borderBottomWidth: "1px",
    borderBottomStyle: "solid",
    borderBottomColor: $colors.bgSub,
  },
});

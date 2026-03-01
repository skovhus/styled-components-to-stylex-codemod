import React from "react";
import * as stylex from "@stylexjs/stylex";
import { $colors } from "./tokens.stylex";

function Box(props: { children?: React.ReactNode }) {
  const { children } = props;

  return <div {...stylex.props(styles.borderBottom)}>{children}</div>;
}

export const App = () => <Box />;

const styles = stylex.create({
  borderBottom: {
    borderBottomWidth: "1px",
    borderBottomStyle: "solid",
    borderBottomColor: $colors.bgSub,
  },
});

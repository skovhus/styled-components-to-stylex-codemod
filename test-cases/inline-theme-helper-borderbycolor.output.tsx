import * as React from "react";
import * as stylex from "@stylexjs/stylex";
import { $colors } from "./tokens.stylex";

type BoxProps = React.PropsWithChildren<{
  ref?: React.Ref<HTMLDivElement>;
}>;

function Box(props: BoxProps) {
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

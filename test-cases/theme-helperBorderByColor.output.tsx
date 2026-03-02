import React from "react";
import * as stylex from "@stylexjs/stylex";
import { $colors } from "./tokens.stylex";

function Box(props: Pick<React.ComponentProps<"div">, "children">) {
  return <div {...stylex.props(styles.borderBottom)}>{props.children}</div>;
}

export const App = () => <Box />;

const styles = stylex.create({
  borderBottom: {
    borderBottomWidth: "1px",
    borderBottomStyle: "solid",
    borderBottomColor: $colors.bgSub,
  },
});

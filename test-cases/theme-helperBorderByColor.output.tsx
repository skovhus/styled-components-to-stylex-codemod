import React from "react";
import * as stylex from "@stylexjs/stylex";
import { $colors } from "./tokens.stylex";

function Box(props: React.PropsWithChildren<{}>) {
  return <div sx={styles.borderBottom}>{props.children}</div>;
}

export const App = () => <Box />;

const styles = stylex.create({
  borderBottom: {
    borderBottomWidth: "1px",
    borderBottomStyle: "solid",
    borderBottomColor: $colors.bgSub,
  },
});

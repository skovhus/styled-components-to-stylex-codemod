// Border shorthand from helper function call returning full border value
import React from "react";
import * as stylex from "@stylexjs/stylex";
import { pixelVars } from "./tokens.stylex";

function Container(props: React.PropsWithChildren<{}>) {
  return <div sx={[styles.container, styles.border]}>{props.children}</div>;
}

export function App() {
  return <Container>Hello</Container>;
}

const styles = stylex.create({
  container: {
    paddingBlock: "8px",
    paddingInline: "16px",
  },
  border: {
    borderWidth: pixelVars.thin,
    borderStyle: "solid",
    borderColor: "transparent",
  },
});

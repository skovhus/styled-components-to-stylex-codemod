import React from "react";
import * as stylex from "@stylexjs/stylex";
import { $shadow } from "./tokens.stylex";
import { shadow } from "./lib/helpers";

type BoxProps = {
  children?: React.ReactNode;
  shadow: "dark" | "light";
};

// Test: adapter resolution for helper calls with dynamic prop args.
// The adapter remaps `shadow` → `$shadow` from tokens.stylex.

function Box(props: BoxProps) {
  const { children, shadow } = props;

  return <div {...stylex.props(styles.box, styles.boxBoxShadow(shadow))}>{children}</div>;
}

export const App = () => (
  <div style={{ display: "flex", gap: "16px", padding: "16px" }}>
    <Box shadow="dark">Dark shadow</Box>
    <Box shadow="light">Light shadow</Box>
  </div>
);

const styles = stylex.create({
  box: {
    height: "50px",
    width: "50px",
    padding: "8px",
    backgroundColor: "#f0f0f0",
  },
  boxBoxShadow: (boxShadow: "dark" | "light") => ({
    boxShadow: $shadow[boxShadow],
  }),
});

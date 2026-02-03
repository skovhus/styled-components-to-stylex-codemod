import React from "react";
import * as stylex from "@stylexjs/stylex";
import { mergedSx } from "./lib/mergedSx";

type BoxProps = {
  $large?: boolean;
} & { style?: React.CSSProperties; children?: React.ReactNode };

// Arrow function with block body (contains comment)
// Should be equivalent to expression-body: ${props => props.$large ? 34 : 6}px
function Box(props: BoxProps) {
  const { children, style, $large } = props;
  return (
    <div {...mergedSx([styles.box, $large ? styles.boxLarge : undefined], undefined, style)}>
      {children}
    </div>
  );
}

export const App = () => (
  <div>
    <Box $large>Large Box (bottom: 80px)</Box>
    <Box style={{ left: 200 }}>Small Box (bottom: 20px)</Box>
  </div>
);

const styles = stylex.create({
  box: {
    position: "fixed",
    left: "10px",
    bottom: "20px",
    paddingBlock: "12px",
    paddingInline: "16px",
    backgroundColor: "paleturquoise",
    borderWidth: "2px",
    borderStyle: "solid",
    borderColor: "teal",
  },
  boxLarge: {
    bottom: "80px",
  },
});

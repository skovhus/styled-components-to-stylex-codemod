import React from "react";
import * as stylex from "@stylexjs/stylex";

type BoxProps = React.PropsWithChildren<{
  $large?: boolean;
}>;

// Arrow function with block body (contains comment)
// Should be equivalent to expression-body: ${props => props.$large ? 34 : 6}px
function Box(props: BoxProps) {
  const { children, $large } = props;
  return <div {...stylex.props(styles.box, $large && styles.boxLarge)}>{children}</div>;
}

export const App = () => (
  <div>
    <Box $large>Large Box (bottom: 34px)</Box>
    <Box>Small Box (bottom: 6px)</Box>
  </div>
);

const styles = stylex.create({
  box: {
    padding: "8px",
    bottom: `${6}px`,
  },
  boxLarge: {
    bottom: `${34}px`,
  },
});

import React from "react";
import * as stylex from "@stylexjs/stylex";

type BoxProps = Omit<React.ComponentProps<"div">, "className" | "style"> & {
  $large?: boolean;
};

// Arrow function with block body (contains comment)
// Should be equivalent to expression-body: ${props => props.$large ? 34 : 6}px
function Box(props: BoxProps) {
  const { children, $large } = props;

  const sx = stylex.props(styles.box);
  return (
    <div
      {...sx}
      style={{
        ...sx.style,
        bottom: `${$large ? 34 : 6}px`,
      }}
    >
      {children}
    </div>
  );
}

export const App = () => (
  <div>
    <Box $large>Large Box (bottom: 34px)</Box>
    <Box>Small Box (bottom: 6px)</Box>
  </div>
);

const styles = stylex.create({
  // Arrow function with block body (contains comment)
  // Should be equivalent to expression-body: ${props => props.$large ? 34 : 6}px
  box: {
    padding: "8px",
  },
});

import React from "react";
import * as stylex from "@stylexjs/stylex";

type BoxProps = Omit<React.ComponentProps<"div">, "style" | "className"> & {
  $delay?: number;
  children?: React.ReactNode;
};

function Box(props: BoxProps) {
  const { children, $delay } = props;
  return (
    <div {...stylex.props(styles.box, styles.boxTransitionDelay(`${$delay ?? 0}ms`))}>
      {children}
    </div>
  );
}

export const App = () => (
  <div>
    <Box>Default delay</Box>
    <Box $delay={100}>Custom delay</Box>
  </div>
);

const styles = stylex.create({
  box: {
    transitionDelay: "0ms",
    transitionProperty: "opacity",
    transitionDuration: "200ms",
    transitionTimingFunction: "ease-out",
  },
  boxTransitionDelay: (transitionDelay: string) => ({
    transitionDelay,
  }),
});

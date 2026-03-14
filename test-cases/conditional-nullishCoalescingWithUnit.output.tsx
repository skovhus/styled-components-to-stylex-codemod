import React from "react";
import * as stylex from "@stylexjs/stylex";

type BoxProps = {
  delay?: number;
  children?: React.ReactNode;
};

function Box(props: React.PropsWithChildren<BoxProps>) {
  const { children, delay } = props;

  return (
    <div
      sx={styles.box({
        transitionDelay: `${delay ?? 0}ms`,
      })}
    >
      {children}
    </div>
  );
}

export const App = () => (
  <div>
    <Box>Default delay</Box>
    <Box delay={100}>Custom delay</Box>
  </div>
);

const styles = stylex.create({
  box: (props: { transitionDelay: string }) => ({
    transitionProperty: "opacity",
    transitionDuration: "200ms",
    transitionTimingFunction: "ease-out",
    // eslint-disable-next-line stylex/valid-styles -- dynamic style fn param
    transitionDelay: props.transitionDelay,
  }),
});

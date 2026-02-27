import * as React from "react";
import * as stylex from "@stylexjs/stylex";
import { Flex } from "./lib/flex";

type ContainerProps = Omit<React.ComponentPropsWithRef<typeof Flex>, "className" | "style"> & {
  $open: boolean;
  $duration: number;
  $delay: number;
};

function Container(props: ContainerProps) {
  const { children, $open, $duration, $delay, ...rest } = props;

  return (
    <Flex
      {...rest}
      {...stylex.props(
        styles.container,
        styles.containerTransition($duration),
        $open
          ? styles.containerOpen({
              $delay,
            })
          : undefined,
      )}
    >
      {children}
    </Flex>
  );
}

export const App = () => (
  <div style={{ display: "flex", gap: "16px" }}>
    <Container $open={true} $delay={100} $duration={300}>
      <button style={{ padding: "8px 16px" }}>Visible and clickable</button>
    </Container>
    <Container $open={false} $delay={0} $duration={200}>
      <button style={{ padding: "8px 16px" }}>Hidden and not clickable</button>
    </Container>
  </div>
);

const styles = stylex.create({
  container: {
    opacity: 0,
    transitionDelay: "0ms",
    pointerEvents: "none",
  },
  containerOpen: (props) => ({
    opacity: 1,
    pointerEvents: "inherit",
    transitionDelay: `${props.$delay}ms`,
  }),
  containerTransition: (transition: number) => ({
    transition: `opacity ${transition}ms`,
  }),
});

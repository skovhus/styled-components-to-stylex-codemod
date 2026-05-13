import * as React from "react";
import * as stylex from "@stylexjs/stylex";
import { Flex } from "./lib/flex";

type ContainerProps = {
  open: boolean;
  duration: number;
  delay: number;
} & Omit<React.ComponentPropsWithRef<typeof Flex>, "className" | "style">;

function Container(props: ContainerProps) {
  const { children, duration, delay, open, ...rest } = props;
  return (
    <Flex
      {...rest}
      {...stylex.props(
        styles.container,
        durationVariants[duration as keyof typeof durationVariants] ??
          styles.containerDuration(duration),
        open && styles.containerOpen(delay),
      )}
    >
      {children}
    </Flex>
  );
}

export const App = () => (
  <div style={{ display: "flex", gap: "16px" }}>
    <Container open={true} delay={100} duration={300}>
      <button style={{ padding: "8px 16px" }}>Visible and clickable</button>
    </Container>
    <Container open={false} delay={0} duration={200}>
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
  containerOpen: (delay: number) => ({
    pointerEvents: "inherit",
    opacity: 1,
    transitionDelay: `${delay}ms`,
  }),
  containerDuration: (duration: number) => ({
    transition: `opacity ${duration}ms`,
  }),
});

const durationVariants = stylex.create({
  200: {
    transition: "opacity 200ms",
  },
  300: {
    transition: "opacity 300ms",
  },
});

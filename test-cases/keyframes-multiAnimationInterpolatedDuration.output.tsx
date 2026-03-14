// Multi-animation with interpolated duration in both segments
import * as React from "react";
import * as stylex from "@stylexjs/stylex";

const fadeIn = stylex.keyframes({
  from: {
    opacity: 0,
  },

  to: {
    opacity: 1,
  },
});

const slideIn = stylex.keyframes({
  from: {
    transform: "translateX(-100%)",
  },

  to: {
    transform: "translateX(0)",
  },
});

type AnimatedCardProps = React.PropsWithChildren<{
  duration?: number;
}>;

// Both animations share the same interpolated duration prop
function AnimatedCard(props: AnimatedCardProps) {
  const { children, duration } = props;
  return (
    <div
      sx={[
        styles.animatedCard,
        duration != null &&
          styles.animatedCardAnimationDuration(`${duration ?? 200}ms, ${duration ?? 1000}ms`),
      ]}
    >
      {children}
    </div>
  );
}

export function App() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, padding: 16 }}>
      <AnimatedCard>Default (200ms, 1000ms)</AnimatedCard>
      <AnimatedCard duration={500}>Custom (500ms, 500ms)</AnimatedCard>
    </div>
  );
}

const styles = stylex.create({
  animatedCard: {
    animationName: `${fadeIn}, ${slideIn}`,
    animationDuration: "200ms, 1000ms",
    animationTimingFunction: "ease, linear",
    padding: 20,
    backgroundColor: "white",
  },
  animatedCardAnimationDuration: (animationDuration: string) => ({
    animationDuration,
  }),
});

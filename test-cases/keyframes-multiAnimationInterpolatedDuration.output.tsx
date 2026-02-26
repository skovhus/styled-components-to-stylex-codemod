// Multi-animation with interpolated duration in one segment
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
  $duration?: number;
}>;

// First animation has interpolated duration, second has static duration
// When $duration is provided, animationDuration should be "${$duration}ms, 1s"
// not just "${$duration}ms" which would drop the second animation's duration
function AnimatedCard(props: AnimatedCardProps) {
  const { children, $duration } = props;

  return (
    <div
      {...stylex.props(
        styles.animatedCard,
        $duration != null && styles.animatedCardAnimationDuration(`${$duration ?? 200}ms, 1s`),
      )}
    >
      {children}
    </div>
  );
}

export function App() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, padding: 16 }}>
      <AnimatedCard>Default (200ms, 1s)</AnimatedCard>
      <AnimatedCard $duration={500}>Custom (500ms, 1s)</AnimatedCard>
    </div>
  );
}

const styles = stylex.create({
  // First animation has interpolated duration, second has static duration
  // When $duration is provided, animationDuration should be "${$duration}ms, 1s"
  // not just "${$duration}ms" which would drop the second animation's duration
  animatedCard: {
    animationName: `${fadeIn}, ${slideIn}`,
    animationDuration: "200ms, 1s",
    animationTimingFunction: "ease, linear",
    padding: "20px",
    backgroundColor: "white",
  },

  animatedCardAnimationDuration: (animationDuration: string) => ({
    animationDuration,
  }),
});

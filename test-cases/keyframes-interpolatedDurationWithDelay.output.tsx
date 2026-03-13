// Keyframes with interpolated duration BEFORE static delay (order matters)
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

type FadeInWithDelayProps = React.PropsWithChildren<{
  duration?: number;
}>;

// Critical: interpolated time comes BEFORE the static time
// In CSS animation shorthand, first time = duration, second time = delay
// So the interpolated value should be duration, and "0.5s" should be delay
function FadeInWithDelay(props: FadeInWithDelayProps) {
  const { children, duration } = props;

  return (
    <span
      sx={[
        styles.fadeInWithDelay,
        duration != null && styles.fadeInWithDelayAnimationDuration(`${duration ?? 200}ms`),
      ]}
    >
      {children}
    </span>
  );
}

export function App() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, padding: 16 }}>
      <FadeInWithDelay>Default duration (200ms), delay (0.5s)</FadeInWithDelay>
      <FadeInWithDelay duration={800}>Custom duration (800ms), delay (0.5s)</FadeInWithDelay>
    </div>
  );
}

const styles = stylex.create({
  fadeInWithDelay: {
    animationName: fadeIn,
    animationDuration: "200ms",
    animationTimingFunction: "ease-out",
    animationDelay: "0.5s",
  },
  fadeInWithDelayAnimationDuration: (animationDuration: string) => ({
    animationDuration,
  }),
});

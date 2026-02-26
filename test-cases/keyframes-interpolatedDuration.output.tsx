// Keyframes with interpolated animation duration
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

type FadeInContainerProps = React.PropsWithChildren<{
  $fadeInDuration?: number;
}>;

function FadeInContainer(props: FadeInContainerProps) {
  const { children, $fadeInDuration } = props;

  return (
    <span
      {...stylex.props(
        styles.fadeInContainer,
        $fadeInDuration != null &&
          styles.fadeInContainerAnimationDuration(`${$fadeInDuration ?? 200}ms`),
      )}
    >
      {children}
    </span>
  );
}

export function App() {
  return (
    <div style={{ display: "flex", gap: 16, padding: 16 }}>
      <FadeInContainer>Default (200ms)</FadeInContainer>
      <FadeInContainer $fadeInDuration={500}>Custom (500ms)</FadeInContainer>
    </div>
  );
}

const styles = stylex.create({
  fadeInContainer: {
    animationName: fadeIn,
    animationDuration: "200ms",
    animationTimingFunction: "ease-out",
  },
  fadeInContainerAnimationDuration: (animationDuration: string) => ({
    animationDuration,
  }),
});

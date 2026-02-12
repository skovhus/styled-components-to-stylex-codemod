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

const scaleUp = stylex.keyframes({
  "0%": {
    transform: "scale(0.5)",
  },

  "50%": {
    transform: "scale(1.1)",
  },

  "100%": {
    transform: "scale(1)",
  },
});

export const App = () => (
  <div>
    <div {...stylex.props(styles.fadeBox)}>Fade in</div>
    <div {...stylex.props(styles.animatedCard)}>Animated Card</div>
    <div {...stylex.props(styles.bounceIn)}>Bounce In</div>
    <div {...stylex.props(styles.sequentialAnimation)}>Sequential</div>
    <div {...stylex.props(styles.fullAnimation)}>Full Animation</div>
    <div {...stylex.props(styles.mixedStates)}>Mixed States</div>
  </div>
);

const styles = stylex.create({
  // Single animation
  fadeBox: {
    animationName: fadeIn,
    animationDuration: "0.6s",
    animationTimingFunction: "cubic-bezier(0.165, 0.84, 0.44, 1)",
    animationFillMode: "both",
  },
  // Multiple animations combined
  animatedCard: {
    animationName: `${fadeIn}, ${slideIn}`,
    animationDuration: "0.3s, 0.5s",
    animationTimingFunction: "ease-out, ease-out",
    padding: "20px",
    backgroundColor: "white",
    backgroundImage: "none",
    borderRadius: "8px",
    boxShadow: "0 2px 8px rgba(0, 0, 0, 0.1)",
  },
  // Animation with multiple properties
  bounceIn: {
    animationName: scaleUp,
    animationDuration: "0.6s",
    animationTimingFunction: "cubic-bezier(0.68, -0.55, 0.265, 1.55)",
    animationFillMode: "both",
  },
  // Chained animations with delay
  sequentialAnimation: {
    animationName: `${fadeIn}, ${slideIn}`,
    animationDuration: "0.3s, 0.5s",
    animationTimingFunction: "ease-out, ease-out",
    animationDelay: "0s, 0.3s",
  },
  // Shorthand with full property coverage
  fullAnimation: {
    animationName: fadeIn,
    animationDuration: "1s",
    animationTimingFunction: "steps(4, end)",
    animationDelay: "200ms",
    animationIterationCount: "3",
    animationDirection: "alternate",
    animationFillMode: "both",
    animationPlayState: "running",
  },
  // Mixed play-state, direction, fill-mode across segments
  mixedStates: {
    animationName: `${fadeIn}, ${slideIn}`,
    animationDuration: "500ms, 700ms",
    animationTimingFunction: "ease-in, ease-out",
    animationDelay: "0s, 100ms",
    animationIterationCount: "1, infinite",
    animationDirection: "normal, reverse",
    animationFillMode: "both, forwards",
    animationPlayState: "paused, paused",
  },
});

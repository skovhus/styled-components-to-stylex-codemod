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

const styles = stylex.create({
  fadeBox: {
    animationName: fadeIn,
    animationDuration: "0.5s",
    animationTimingFunction: "ease-in-out",
  },
  animatedCard: {
    animationName: `${fadeIn}, ${slideIn}`,
    animationDuration: "0.3s, 0.5s",
    animationTimingFunction: "ease-out, ease-out",
    padding: "20px",
    backgroundColor: "white",
    borderRadius: "8px",
    boxShadow: "0 2px 8px rgba(0, 0, 0, 0.1)",
  },
  bounceIn: {
    animationName: scaleUp,
    animationDuration: "0.6s",
    animationTimingFunction: "cubic-bezier(0.68, -0.55, 0.265, 1.55)",
    animationFillMode: "both",
  },
  sequentialAnimation: {
    animationName: `${fadeIn}, ${slideIn}`,
    animationDuration: "0.3s, 0.5s",
    animationTimingFunction: "ease-out, ease-out",
    animationDelay: "0s, 0.3s",
  },
});

export const App = () => (
  <div>
    <div {...stylex.props(styles.fadeBox)}>Fade in</div>
    <div {...stylex.props(styles.animatedCard)}>Animated Card</div>
    <div {...stylex.props(styles.bounceIn)}>Bounce In</div>
    <div {...stylex.props(styles.sequentialAnimation)}>Sequential</div>
  </div>
);

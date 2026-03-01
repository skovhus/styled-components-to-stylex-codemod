import * as React from "react";
import * as stylex from "@stylexjs/stylex";

type CircleProps = Omit<React.ComponentProps<"path">, "className" | "style"> & {
  $isAnimated?: boolean;
};

function Circle(props: CircleProps) {
  const { children, $isAnimated, ...rest } = props;

  return (
    <path
      {...rest}
      {...stylex.props(styles.circle, $isAnimated ? styles.circleAnimated : undefined)}
    >
      {children}
    </path>
  );
}

export function App() {
  return (
    <div style={{ display: "flex", gap: 16, padding: 20 }}>
      <div {...stylex.props(styles.fadeIn)}>Fading In</div>
      <div {...stylex.props(styles.slideUp)}>Sliding Up</div>
      <div {...stylex.props(styles.bounceIn)}>Bouncing In</div>
      <svg>
        <Circle $isAnimated d="M10,80 Q95,10 180,80" />
        <Circle d="M10,80 Q95,10 180,80" />
      </svg>
    </div>
  );
}

const fadeIn = stylex.keyframes({
  "0%": {
    opacity: 0,
  },

  "100%": {
    opacity: 1,
  },
});

const slideUp = stylex.keyframes({
  from: {
    transform: "translateY(20px)",
    opacity: 0,
  },

  to: {
    transform: "translateY(0)",
    opacity: 1,
  },
});

const bounceIn = stylex.keyframes({
  "0%": {
    transform: "scale(0.5)",
    opacity: 0,
  },

  "100%": {
    transform: "scale(1)",
    opacity: 1,
  },
});

const Dash = stylex.keyframes({
  to: {
    strokeDashoffset: 0,
  },
});

const styles = stylex.create({
  fadeIn: {
    animationName: fadeIn,
    animationDuration: "0.2s",
    animationTimingFunction: "ease",
    animationFillMode: "both",
    backgroundColor: "lightcoral",
    padding: "20px",
  },
  slideUp: {
    animationName: slideUp,
    animationDuration: "0.3s",
    animationTimingFunction: "ease-out",
    backgroundColor: "lightblue",
    padding: "20px",
  },
  bounceIn: {
    animationName: bounceIn,
    animationDuration: "0.4s",
    animationTimingFunction: "cubic-bezier(0.68, -0.55, 0.27, 1.55)",
    backgroundColor: "lightgreen",
    padding: "20px",
  },
  circle: {
    strokeDasharray: 100,
    strokeDashoffset: 100,
  },
  circleAnimated: {
    animationName: Dash,
    animationDuration: "1s",
    animationTimingFunction: "ease-out",
    animationFillMode: "forwards",
  },
});

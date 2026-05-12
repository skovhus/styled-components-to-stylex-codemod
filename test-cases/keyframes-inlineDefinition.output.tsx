import * as React from "react";
import * as stylex from "@stylexjs/stylex";

type CircleProps = { isAnimated?: boolean } & Omit<
  React.ComponentProps<"path">,
  "className" | "style"
>;

function Circle(props: CircleProps) {
  const { children, isAnimated, ...rest } = props;
  return (
    <path {...rest} sx={[styles.circle, isAnimated && styles.circleAnimated]}>
      {children}
    </path>
  );
}

type RingProps = { isAnimated?: boolean } & Omit<
  React.ComponentProps<"path">,
  "className" | "style"
>;

function Ring(props: RingProps) {
  const { children, isAnimated, ...rest } = props;
  return (
    <path {...rest} sx={isAnimated && styles.ringAnimated}>
      {children}
    </path>
  );
}

type AnimatedGroupProps = { isAnimated?: boolean } & Omit<
  React.ComponentProps<"g">,
  "className" | "style"
>;

function AnimatedGroup(props: AnimatedGroupProps) {
  const { children, isAnimated, ...rest } = props;
  return (
    <g {...rest} sx={isAnimated ? styles.animatedGroupAnimated : styles.animatedGroupResting}>
      {children}
    </g>
  );
}

export function App() {
  return (
    <div style={{ display: "flex", gap: 16, padding: 20 }}>
      <div sx={styles.fadeIn}>Fading In</div>
      <div sx={styles.slideUp}>Sliding Up</div>
      <div sx={styles.bounceIn}>Bouncing In</div>
      <svg>
        <Circle isAnimated d="M10,80 Q95,10 180,80" />
        <Circle d="M10,80 Q95,10 180,80" />
        <Ring isAnimated d="M20,90 Q105,20 190,90" />
        <AnimatedGroup isAnimated>
          <circle cx="24" cy="24" r="12" />
        </AnimatedGroup>
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

const PrimaryMove = stylex.keyframes({
  to: {
    transform: "translateX(-18px)",
  },
});

const SecondaryMove = stylex.keyframes({
  to: {
    transform: "translateX(-10px)",
  },
});

const styles = stylex.create({
  fadeIn: {
    animationName: fadeIn,
    animationDuration: "0.2s",
    animationTimingFunction: "ease",
    animationFillMode: "both",
    backgroundColor: "lightcoral",
    padding: 20,
  },
  slideUp: {
    animationName: slideUp,
    animationDuration: "0.3s",
    animationTimingFunction: "ease-out",
    backgroundColor: "lightblue",
    padding: 20,
  },
  bounceIn: {
    animationName: bounceIn,
    animationDuration: "0.4s",
    animationTimingFunction: "cubic-bezier(0.68, -0.55, 0.27, 1.55)",
    backgroundColor: "lightgreen",
    padding: 20,
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
  ringAnimated: {
    animationName: Dash,
    animationDuration: "1.5s",
    animationTimingFunction: "ease-out",
    animationFillMode: "forwards",
  },
  animatedGroupAnimated: {
    animationName: `${PrimaryMove}, ${SecondaryMove}`,
    animationDuration: "1s, 1.4s",
    animationTimingFunction: "ease-out, ease-in-out",
    animationFillMode: "forwards, forwards",
    animationDelay: "0s, 1s",
  },
  animatedGroupResting: {
    transform: "translateX(-10px)",
  },
});

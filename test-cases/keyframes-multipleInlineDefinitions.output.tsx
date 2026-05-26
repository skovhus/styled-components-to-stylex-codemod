import * as React from "react";
import * as stylex from "@stylexjs/stylex";

type AnimatedGroupProps = React.PropsWithChildren<{
  isAnimated?: boolean;
}>;

function AnimatedGroup(props: AnimatedGroupProps) {
  const { children, isAnimated } = props;
  return (
    <g sx={isAnimated ? styles.animatedGroupAnimated : styles.animatedGroupNotAnimated}>
      {children}
    </g>
  );
}

export function App() {
  return (
    <svg>
      <AnimatedGroup isAnimated>
        <circle cx="24" cy="24" r="12" />
      </AnimatedGroup>
    </svg>
  );
}

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
  animatedGroupAnimated: {
    animationName: `${PrimaryMove}, ${SecondaryMove}`,
    animationDuration: "1s, 1.4s",
    animationTimingFunction: "ease-out, ease-in-out",
    animationFillMode: "forwards",
    animationDelay: "0s, 1s",
  },
  animatedGroupNotAnimated: {
    transform: "translateX(-10px)",
  },
});

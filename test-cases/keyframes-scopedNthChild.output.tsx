import React from "react";
import * as stylex from "@stylexjs/stylex";

const bounce = stylex.keyframes({
  "0%,100%": {
    transform: "translateY(0)",
  },

  "50%": {
    transform: "translateY(-4px)",
  },
});

function AnimatedPath(props: Pick<React.ComponentProps<"path">, "children" | "d">) {
  const { children, ...rest } = props;

  return (
    <path {...rest} {...stylex.props(styles.animatedPath)}>
      {children}
    </path>
  );
}

export const App = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" style={{ color: "#bf4f74" }}>
    <AnimatedPath d="M4 14h16v2H4z" />
    <AnimatedPath d="M12 4l4 4H8z" />
  </svg>
);

const styles = stylex.create({
  animatedPath: {
    fill: "currentColor",
    transformOrigin: {
      default: null,
      ":nth-child(2)": "center",
    },
    animationName: {
      default: null,
      ":nth-child(2)": bounce,
    },
    animationDuration: {
      default: null,
      ":nth-child(2)": "1s",
    },
    animationTimingFunction: {
      default: null,
      ":nth-child(2)": "ease-in-out",
    },
    animationIterationCount: {
      default: null,
      ":nth-child(2)": "infinite",
    },
  },
});

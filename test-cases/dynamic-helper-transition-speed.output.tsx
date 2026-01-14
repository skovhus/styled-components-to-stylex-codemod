import React from "react";
import * as stylex from "@stylexjs/stylex";
import { transitionSpeed as transitionSpeedVars } from "./lib/helpers.stylex";
import "./css-variables.css";

type AnimatedPathProps = Omit<React.ComponentProps<"path">, "className"> & {
  $width: number;
};

function AnimatedPath(props: AnimatedPathProps) {
  const { children, style, $width, ...rest } = props;

  const sx = stylex.props(styles.animatedPath, styles.animatedPathStrokeWidth($width));
  return (
    <path
      {...sx}
      style={{
        ...sx.style,
        ...style,
      }}
      {...rest}
    >
      {children}
    </path>
  );
}

export const App = () => {
  const [on, setOn] = React.useState(false);

  React.useEffect(() => {
    const id = window.setInterval(() => setOn((v) => !v), 650);
    return () => window.clearInterval(id);
  }, []);
  return (
    <div style={{ fontFamily: "system-ui" }}>
      <svg
        width="140"
        height="60"
        viewBox="0 0 140 60"
        style={{
          border: "1px solid #e0e0e0",
          borderRadius: 6,
          background: "white",
        }}
      >
        <AnimatedPath d="M10 30 L130 30" style={{ opacity: on ? 1 : 0.2 }} $width={6} />
      </svg>
    </div>
  );
};

const styles = stylex.create({
  animatedPath: {
    transitionProperty: "opacity",
    transitionDuration: transitionSpeedVars.slowTransition,
    stroke: "#bf4f74",
    fill: "none",
  },
  animatedPathStrokeWidth: (strokeWidth: number) => ({
    strokeWidth: `${strokeWidth}px`,
  }),
});

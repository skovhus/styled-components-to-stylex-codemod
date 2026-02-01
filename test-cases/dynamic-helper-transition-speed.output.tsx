import React from "react";
import * as stylex from "@stylexjs/stylex";
import { transitionSpeed } from "./tokens.stylex";
import "./css-variables.css";

type AnimatedPathProps = Omit<React.ComponentProps<"path">, "className" | "style"> & {
  $width: number;
};

function AnimatedPath(props: AnimatedPathProps) {
  const { children, $width, ...rest } = props;
  return (
    <path {...rest} {...stylex.props(styles.animatedPath, styles.animatedPathStrokeWidth($width))}>
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
        <AnimatedPath d="M10 30 L130 30" $width={6} />
      </svg>
    </div>
  );
};

const styles = stylex.create({
  animatedPath: {
    transitionProperty: "opacity",
    transitionDuration: transitionSpeed.slow,
    stroke: "#bf4f74",
    fill: "none",
  },
  animatedPathStrokeWidth: (strokeWidth: number) => ({
    strokeWidth: `${strokeWidth}px`,
  }),
});

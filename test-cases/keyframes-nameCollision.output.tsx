// Inline @keyframes name matches the exported component name
import * as React from "react";
import * as stylex from "@stylexjs/stylex";

export function Move(props: React.PropsWithChildren<{ ref?: React.Ref<HTMLDivElement> }>) {
  const { children, ...rest } = props;

  return (
    <div {...rest} {...stylex.props(styles.move)}>
      {children}
    </div>
  );
}

export function App() {
  return (
    <div style={{ display: "flex", gap: 16, padding: 20 }}>
      <Move>Moving in</Move>
    </div>
  );
}

const MoveAnimation = stylex.keyframes({
  from: {
    transform: "translateX(-8px)",
    opacity: 0,
  },

  to: {
    transform: "translateX(0)",
    opacity: 1,
  },
});

const styles = stylex.create({
  move: {
    animationName: MoveAnimation,
    animationDuration: "0.6s",
    animationTimingFunction: "ease-out",
    backgroundColor: "#e0f2fe",
    borderRadius: "8px",
    padding: "16px",
    color: "#0369a1",
  },
});

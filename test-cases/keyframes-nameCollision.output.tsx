// Inline @keyframes name matches the exported component name
import * as React from "react";
import * as stylex from "@stylexjs/stylex";

export function Move(props: Pick<React.ComponentProps<"div">, "ref" | "children">) {
  const { children, ...rest } = props;
  return (
    <div {...rest} sx={styles.move}>
      {children}
    </div>
  );
}

type MoveIconProps = { animated?: boolean } & Omit<
  React.ComponentProps<"svg">,
  "className" | "style"
>;

export function MoveIcon(props: MoveIconProps) {
  const { children, animated, ...rest } = props;
  return (
    <svg {...rest} sx={[styles.moveIcon, animated && styles.moveIconAnimated]}>
      {children}
    </svg>
  );
}

export function App() {
  return (
    <div style={{ display: "flex", gap: 16, padding: 20 }}>
      <Move>Moving in</Move>
      <MoveIcon animated viewBox="0 0 32 32">
        <circle cx="16" cy="16" r="12" />
      </MoveIcon>
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

const MoveIconAnimation = stylex.keyframes({
  from: {
    transform: "translateY(4px)",
  },

  to: {
    transform: "translateY(0)",
  },
});

const styles = stylex.create({
  move: {
    animationName: MoveAnimation,
    animationDuration: "0.6s",
    animationTimingFunction: "ease-out",
    backgroundColor: "#e0f2fe",
    borderRadius: 8,
    padding: 16,
    color: "#0369a1",
  },
  moveIcon: {
    width: 32,
    height: 32,
    fill: "#4f46e5",
  },
  moveIconAnimated: {
    animationName: MoveIconAnimation,
    animationDuration: "0.8s",
    animationTimingFunction: "ease-out",
    animationFillMode: "forwards",
  },
});

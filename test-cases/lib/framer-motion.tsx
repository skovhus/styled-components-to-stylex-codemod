import React from "react";

// Minimal stub of `framer-motion` used by fixtures.
// motion.div only accepts HTMLMotionProps which is strict (no arbitrary data- attributes).
export type HTMLMotionProps<T extends keyof JSX.IntrinsicElements> = React.ComponentPropsWithRef<T> & {
  initial?: Record<string, unknown>;
  animate?: Record<string, unknown>;
  transition?: Record<string, unknown>;
};

export const motion = {
  div: React.forwardRef<HTMLDivElement, HTMLMotionProps<"div">>((props, ref) => (
    <div ref={ref} {...props} />
  )),
};

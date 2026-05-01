import React from "react";

// Minimal stub of `framer-motion` used by fixtures.
// motion.div only accepts HTMLMotionProps which is strict (no arbitrary data- attributes).
export type MotionValue<T> = {
  get(): T;
};

type MotionStyle = Omit<React.CSSProperties, "height" | "opacity" | "width"> & {
  height?: React.CSSProperties["height"] | MotionValue<number>;
  opacity?: React.CSSProperties["opacity"] | MotionValue<number>;
  width?: React.CSSProperties["width"] | MotionValue<number>;
  x?: number | MotionValue<number>;
  y?: number | MotionValue<number>;
};

export type HTMLMotionProps<T extends keyof React.JSX.IntrinsicElements> = Omit<
  React.ComponentPropsWithRef<T>,
  "style"
> & {
  initial?: Record<string, unknown>;
  animate?: Record<string, unknown>;
  style?: MotionStyle;
  transition?: Record<string, unknown>;
};

export const motion = {
  div: React.forwardRef<HTMLDivElement, HTMLMotionProps<"div">>(({ style, ...props }, ref) => (
    <div ref={ref} {...props} style={style as React.CSSProperties | undefined} />
  )),
  img: React.forwardRef<HTMLImageElement, HTMLMotionProps<"img">>(({ style, ...props }, ref) => (
    <img ref={ref} {...props} style={style as React.CSSProperties | undefined} />
  )),
};

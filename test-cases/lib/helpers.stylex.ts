import * as stylex from "@stylexjs/stylex";

// CSS snippet helpers converted to StyleX create objects
export const helpers = stylex.create({
  truncate: {
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  },
  flexCenter: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  gradient: {
    backgroundImage: "linear-gradient(90deg, #ff6b6b, #5f6cff)",
    color: "transparent",
  },
  truncateMultiline: (lines: number) => ({
    display: "-webkit-box" as const,
    WebkitLineClamp: lines,
    WebkitBoxOrient: "vertical" as const,
    overflow: "hidden" as const,
  }),
});

// Scroll fade mask styles - parameterized with size and direction.
// Uses stylex.create with dynamic functions for the size parameter.
const scrollFadeMask = stylex.create({
  both: (size: string) => ({
    maskImage: `linear-gradient(to bottom, transparent, black ${size}, black calc(100% - ${size}), transparent)`,
  }),
  top: (size: string) => ({
    maskImage: `linear-gradient(to bottom, transparent, black ${size}, black)`,
  }),
  bottom: (size: string) => ({
    maskImage: `linear-gradient(to bottom, black, black calc(100% - ${size}), transparent)`,
  }),
});

/** Returns a StyleX style for scroll fade mask effects. */
export const scrollFadeMaskStyles = (size: number, direction: "top" | "bottom" | "both" = "both") =>
  scrollFadeMask[direction](`${size}px`);

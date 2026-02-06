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
});

// Scroll fade mask styles - uses static stylex.create for compiler compatibility
const scrollFadeMaskBase = stylex.create({
  fade: {
    maskImage:
      "linear-gradient(to bottom, transparent, black 18px, black calc(100% - 18px), transparent)",
  },
});

// Helper function that returns the pre-built style object
export const scrollFadeMaskStyles = (_size: number, _direction?: "top" | "bottom" | "both") => {
  return scrollFadeMaskBase.fade;
};

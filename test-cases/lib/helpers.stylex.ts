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

// Dynamic scroll fade mask helper - this would be the correct StyleX implementation
// that returns a style object, not a RuleSet
export const scrollFadeMaskStyles = (size: number, direction?: "top" | "bottom" | "both") => {
  return stylex.create({
    fade: {
      // In real implementation, this would use CSS variables or runtime values
      maskImage: `linear-gradient(to bottom, ${
        direction === "top" || direction === "both" ? `transparent, black ${size}px, ` : ""
      }black${
        direction === "bottom" || direction === "both" ? `, black calc(100% - ${size}px), transparent` : ""
      })`,
    },
  }).fade;
};

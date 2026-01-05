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
});

export const transitionSpeed = stylex.defineVars({
  highlightFadeIn: "0s",
  highlightFadeOut: "0.15s",
  quickTransition: "0.1s",
  regularTransition: "0.25s",
  slowTransition: "0.35s",
});

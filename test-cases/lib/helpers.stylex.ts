import * as stylex from "@stylexjs/stylex";
import { $colors } from "../tokens.stylex";

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

export const borders = stylex.create({
  labelMuted: {
    borderWidth: "1px",
    borderStyle: "solid",
    borderColor: $colors.labelMuted,
  },
});

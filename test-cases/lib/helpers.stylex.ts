import * as stylex from "@stylexjs/stylex";
import { themeVars } from "../tokens.stylex";

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

export const borders = stylex.create({
  labelMuted: {
    borderWidth: "1px",
    borderStyle: "solid",
    borderColor: themeVars.labelMuted,
  },
});

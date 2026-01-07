import * as stylex from "@stylexjs/stylex";
import { themeVars } from "./tokens.stylex";
import * as React from "react";
type Color = "labelBase" | "labelMuted";

const styles = stylex.create({
  box: {
    width: "42px",
    height: "100%",
    padding: "16px",
  },
  boxBackgroundColorHover: (hoverColor: string) => ({
    ":hover": {
      backgroundColor: themeVars[hoverColor],
    },
  }),
  boxBackgroundColor: (bg: string) => ({
    backgroundColor: themeVars[bg],
  }),
});

function Box(props) {
  const { hoverColor, bg } = props;

  return (
    <div
      {...stylex.props(
        styles.box,
        hoverColor && styles.boxBackgroundColorHover(hoverColor),
        bg && styles.boxBackgroundColor(bg),
      )}
    >
      {props.children}
    </div>
  );
}

export const App = () => (
  <>
    <Box bg="labelBase" hoverColor="labelMuted" />
    <Box bg="labelMuted" hoverColor="labelBase" />
  </>
);

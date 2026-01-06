import * as stylex from "@stylexjs/stylex";
import { themeVars } from "./tokens.stylex";
import * as React from "react";
type Color = "labelBase" | "labelMuted";

const styles = stylex.create({
  box: {
    width: "100%",
    height: "100%",
    padding: "16px",
  },
  boxBackgroundColor: (bg: string) => ({
    backgroundColor: themeVars[bg],
  }),
});

function Box(props) {
  const { className, children, style, bg, ...rest } = props;

  const sx = stylex.props(styles.box, bg && styles.boxBackgroundColor(bg));

  return (
    <div
      {...sx}
      className={[sx.className, className].filter(Boolean).join(" ")}
      style={{
        ...sx.style,
        ...style,
      }}
      {...rest}
    >
      {children}
    </div>
  );
}

export const App = () => <Box bg="labelBase" />;

import * as stylex from "@stylexjs/stylex";
import { themeVars } from "./tokens.stylex";
import * as React from "react";
type Color = "labelBase" | "labelMuted";

const styles = stylex.create({
  box: {},
  boxBackgroundColorHover: (color: string) => ({
    ":hover": {
      backgroundColor: themeVars[color],
    },
  }),
});

function Box(props) {
  const { className, children, style, color, ...rest } = props;

  const sx = stylex.props(styles.box, color && styles.boxBackgroundColorHover(color));

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

export const App = () => <Box color="labelBase" />;

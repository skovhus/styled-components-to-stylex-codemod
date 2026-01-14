import * as React from "react";
import * as stylex from "@stylexjs/stylex";
import { themeVars } from "./tokens.stylex";

type Color = "labelBase" | "labelMuted";

type BoxProps = React.PropsWithChildren<{
  $bg: Color;
  $hoverColor: Color;
}>;

function Box(props: BoxProps) {
  const { children, $hoverColor, $bg } = props;

  const sx = stylex.props(
    styles.box,
    styles.boxBackgroundColorHover($hoverColor),
    styles.boxBackgroundColor($bg),
  );
  return <div {...sx}>{children}</div>;
}

export const App = () => (
  <>
    <Box $bg="labelBase" $hoverColor="labelMuted" />
    <Box $bg="labelMuted" $hoverColor="labelBase" />
  </>
);

// Pattern 2: Type imported from another file (like TextColor.tsx in a design system)
// The codemod should preserve the imported type, not convert to `string`
import type { Colors } from "./lib/colors";

interface TextColorProps extends Omit<
  React.HTMLAttributes<HTMLSpanElement>,
  "className" | "style"
> {
  /** The color from the theme */
  color: Colors;
}

export function TextColor(props: TextColorProps) {
  const { children, color } = props;

  const sx = stylex.props(styles.textColor, styles.textColorColor(color));
  return <span {...sx}>{children}</span>;
}

const styles = stylex.create({
  box: {
    width: "42px",
    height: "100%",
    padding: "16px",
  },
  boxBackgroundColorHover: ($hoverColor: Color) => ({
    ":hover": {
      backgroundColor: themeVars[$hoverColor],
    },
  }),
  boxBackgroundColor: ($bg: Color) => ({
    backgroundColor: themeVars[$bg],
  }),
  textColor: {},
  textColorColor: (color: Colors) => ({
    color: themeVars[color],
  }),
});

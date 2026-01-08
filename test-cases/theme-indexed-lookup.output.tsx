import * as stylex from "@stylexjs/stylex";
import { themeVars } from "./tokens.stylex";
import * as React from "react";

type Color = "labelBase" | "labelMuted";

const styles = stylex.create({
  // Use transient props so they don't get forwarded to the DOM in Storybook.
  box: {
    width: "42px",
    height: "100%",
    padding: "16px",
  },
  boxBackgroundColorHover: ($hoverColor: string) => ({
    ":hover": {
      backgroundColor: (themeVars as any)[$hoverColor],
    },
  }),
  boxBackgroundColor: ($bg: string) => ({
    backgroundColor: (themeVars as any)[$bg],
  }),
});

type BoxProps = React.PropsWithChildren<{
  $bg: Color;
  $hoverColor: Color;
}>;

function Box(props: BoxProps) {
  const { children, className, style, $hoverColor, $bg } = props;

  const sx = stylex.props(
    styles.box,
    styles.boxBackgroundColorHover($hoverColor),
    styles.boxBackgroundColor($bg),
  );
  return (
    <div
      {...sx}
      className={[sx.className, className].filter(Boolean).join(" ")}
      style={{
        ...sx.style,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

export const App = () => (
  <>
    <Box $bg="labelBase" $hoverColor="labelMuted" />
    <Box $bg="labelMuted" $hoverColor="labelBase" />
  </>
);

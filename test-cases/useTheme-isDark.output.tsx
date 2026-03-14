import * as React from "react";
import { useTheme } from "styled-components";
import * as stylex from "@stylexjs/stylex";
import { $colors, pixelVars } from "./tokens.stylex";

function Text(props: React.PropsWithChildren<{}>) {
  const theme = useTheme();
  return (
    <span sx={[styles.text, theme.isDark ? styles.textDark : styles.textLight]}>
      {props.children}
    </span>
  );
}

// theme.isDark controlling an entire CSS block (empty string vs padding)
function Box(props: React.PropsWithChildren<{}>) {
  const theme = useTheme();
  return <div sx={theme.isDark ? undefined : styles.boxLight}>{props.children}</div>;
}

export const App = () => (
  <div>
    <Text>Label</Text>
    <Box>Box</Box>
  </div>
);

const styles = stylex.create({
  text: {
    fontSize: 12,
  },
  textDark: {
    color: $colors.labelBase,
    borderColor: $colors.bgSub,
  },
  textLight: {
    color: $colors.labelMuted,
    borderColor: $colors.bgBorderFaint,
  },
  boxLight: {
    padding: pixelVars.thin,
  },
});

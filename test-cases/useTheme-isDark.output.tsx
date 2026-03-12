import * as React from "react";
import { useTheme } from "styled-components";
import * as stylex from "@stylexjs/stylex";
import { $colors } from "./tokens.stylex";

function Text(props: React.PropsWithChildren<{}>) {
  const theme = useTheme();
  return (
    <span sx={[styles.text, theme.isDark ? styles.textDark : styles.textLight]}>
      {props.children}
    </span>
  );
}

export const App = () => <Text>Label</Text>;

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
});

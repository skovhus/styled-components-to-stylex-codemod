import * as React from "react";
import * as stylex from "@stylexjs/stylex";
import { $colors, transitionSpeed } from "./tokens.stylex";
import { useTheme } from "styled-components";

function Box(props: React.PropsWithChildren<{ ref?: React.Ref<HTMLDivElement> }>) {
  const { children } = props;

  const theme = useTheme();
  return <div {...stylex.props(theme.isDark ? styles.boxDark : styles.boxLight)}>{children}</div>;
}

export const App = () => <Box />;

const styles = stylex.create({
  boxDark: {
    color: $colors.textPrimary,
    transitionDuration: transitionSpeed.fast,
  },
  boxLight: {
    color: $colors.textSecondary,
    transitionDuration: transitionSpeed.slow,
  },
});

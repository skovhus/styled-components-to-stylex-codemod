import React from "react";
import * as stylex from "@stylexjs/stylex";
import { useTheme } from "styled-components";
import { pixelVars } from "./tokens.stylex";

function Box(props: { children?: React.ReactNode }) {
  const { children } = props;

  const theme = useTheme();
  return <div {...stylex.props(theme.isDark ? undefined : styles.boxLight)}>{children}</div>;
}

export const App = () => <Box />;

const styles = stylex.create({
  boxLight: {
    padding: pixelVars.thin,
  },
});

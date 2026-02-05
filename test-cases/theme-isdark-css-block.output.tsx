import React from "react";
import * as stylex from "@stylexjs/stylex";
import { pixelVars } from "./tokens.stylex";
import { useTheme } from "styled-components";

function Box(props: React.PropsWithChildren<{ ref?: React.Ref<HTMLDivElement> }>) {
  const { children } = props;

  const theme = useTheme();
  return <div {...stylex.props(!theme.isDark && styles.boxLight)}>{children}</div>;
}

export const App = () => <Box />;

const styles = stylex.create({
  boxLight: {
    padding: `${pixelVars.thin}`,
  },
});

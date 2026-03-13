import React from "react";
import * as stylex from "@stylexjs/stylex";
import { useTheme } from "styled-components";
import { pixelVars } from "./tokens.stylex";

function Box(props: React.PropsWithChildren<{}>) {
  const theme = useTheme();
  return <div sx={theme.isDark ? undefined : styles.boxLight}>{props.children}</div>;
}

export const App = () => <Box />;

const styles = stylex.create({
  boxLight: {
    padding: pixelVars.thin,
  },
});

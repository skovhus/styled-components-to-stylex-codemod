import React from "react";
import * as stylex from "@stylexjs/stylex";
import { useTheme } from "styled-components";
import { pixelVars } from "./tokens.stylex";

// Block-level theme boolean conditional: theme.isDark controls entire CSS block
function Box(props: React.PropsWithChildren<{ ref?: React.Ref<HTMLDivElement> }>) {
  const { children } = props;

  const theme = useTheme();

  return (
    <div {...stylex.props(styles.box, theme.isDark ? styles.boxDark : styles.boxLight)}>
      {children}
    </div>
  );
}

export const App = () => <Box>Theme prop</Box>;

const styles = stylex.create({
  box: {
    height: "100px",
    width: "100px",
  },
  boxDark: {
    padding: pixelVars.thin,
  },
  boxLight: {
    padding: "100px",
  },
});

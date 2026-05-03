import * as React from "react";
import { useTheme } from "styled-components";
import * as stylex from "@stylexjs/stylex";

// Basic literal values with isDark conditional
function Box(props: React.PropsWithChildren<{}>) {
  const theme = useTheme();
  return (
    <div sx={[styles.box, theme.isDark ? styles.boxDark : styles.boxLight]}>{props.children}</div>
  );
}

export const App = () => (
  <div style={{ backgroundColor: "#991b1b", padding: 16 }}>
    <Box>Hello world</Box>
  </div>
);

const styles = stylex.create({
  box: {
    padding: 16,
  },
  boxDark: {
    mixBlendMode: "color-burn",
    backgroundColor: "rgba(255,255,255,0.035)",
  },
  boxLight: {
    mixBlendMode: "darken",
    backgroundColor: "rgba(0,0,0,0.035)",
  },
});

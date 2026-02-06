import * as React from "react";
import { useTheme } from "styled-components";
import * as stylex from "@stylexjs/stylex";

// Basic literal values with isDark conditional
function Box(props: React.PropsWithChildren<{ ref?: React.Ref<HTMLDivElement> }>) {
  const { children } = props;

  const theme = useTheme();

  return (
    <div {...stylex.props(styles.box, theme.isDark ? styles.boxDark : styles.boxLight)}>
      {children}
    </div>
  );
}

export const App = () => (
  <div style={{ backgroundColor: "red", opacity: 0.5 }}>
    <Box>Hello world</Box>
  </div>
);

const styles = stylex.create({
  box: {
    padding: "16px",
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

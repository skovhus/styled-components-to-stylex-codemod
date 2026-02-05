import * as React from "react";
import * as stylex from "@stylexjs/stylex";
import { useTheme } from "styled-components";

function Box(props: React.PropsWithChildren<{ ref?: React.Ref<HTMLDivElement> }>) {
  const { children } = props;

  const theme = useTheme();

  return (
    <div {...stylex.props(styles.box, theme.isDark ? styles.boxDark : styles.boxLight)}>
      {children}
    </div>
  );
}

export const App = () => <Box />;

const styles = stylex.create({
  box: {
    display: "flex",
  },
  boxDark: {
    mixBlendMode: "lighten",
    opacity: 0.9,
    backgroundColor: "rgba(255,255,255,0.035)",
  },
  boxLight: {
    mixBlendMode: "darken",
    opacity: 0.8,
    backgroundColor: "rgba(0,0,0,0.035)",
  },
});

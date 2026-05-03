import * as React from "react";
import { useTheme } from "styled-components";
import * as stylex from "@stylexjs/stylex";

type BoxProps = React.PropsWithChildren<{
  enabled: boolean;
}>;

// Block-level theme logical conditional: theme.isDark && props.enabled controls entire CSS block
function Box(props: BoxProps) {
  const { children, enabled } = props;
  const theme = useTheme();

  return (
    <div sx={[styles.box, theme.isDark && props.enabled ? styles.boxDark : undefined]}>
      {children}
    </div>
  );
}

export const App = () => (
  <div style={{ display: "flex", gap: 12 }}>
    <Box enabled={true}>Enabled</Box>
    <Box enabled={false}>Disabled</Box>
  </div>
);

const styles = stylex.create({
  box: {
    height: 100,
    width: 100,
    backgroundColor: "red",
  },
  boxDark: {
    opacity: 0.5,
  },
});

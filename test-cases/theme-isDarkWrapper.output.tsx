// theme.isDark conditional on a component wrapper should apply dark/light styles in JSX.
import * as React from "react";
import { useTheme } from "styled-components";
import * as stylex from "@stylexjs/stylex";
import { $colors } from "./tokens.stylex";

function InnerList(
  props: React.PropsWithChildren<{ className?: string; style?: React.CSSProperties }>,
) {
  return <div role="tablist" {...props} />;
}

function StyledList(
  props: Omit<React.ComponentPropsWithRef<typeof InnerList>, "className" | "style">,
) {
  const theme = useTheme();

  return (
    <InnerList
      {...props}
      {...stylex.props(styles.list, theme.isDark ? styles.listDark : styles.listLight)}
    />
  );
}

export const App = () => (
  <StyledList>
    <button>Tab 1</button>
    <button>Tab 2</button>
  </StyledList>
);

const styles = stylex.create({
  list: {
    display: "flex",
    padding: "4px",
    borderRadius: "6px",
  },
  listDark: {
    backgroundColor: $colors.bgBase,
  },
  listLight: {
    backgroundColor: $colors.bgSub,
  },
});

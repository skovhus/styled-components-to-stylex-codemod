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
      {...stylex.props(
        styles.styledList,
        theme.isDark ? styles.styledListDark : styles.styledListLight,
      )}
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
  styledList: {
    display: "flex",
    padding: "4px",
    borderRadius: "6px",
  },
  styledListDark: {
    background: $colors.bgBase,
  },
  styledListLight: {
    background: $colors.bgSub,
  },
});

// Function interpolation inside a pseudo selector returning css blocks should not be silently dropped.
import * as React from "react";
import { useTheme } from "styled-components";
import * as stylex from "@stylexjs/stylex";
import { $colors } from "./tokens.stylex";

function Tab(props: React.PropsWithChildren<{ ref?: React.Ref<HTMLButtonElement> }>) {
  const { children, ...rest } = props;

  const theme = useTheme();

  return (
    <button
      {...rest}
      {...stylex.props(styles.tab, theme.isDark ? styles.tabActiveDark : styles.tabActiveLight)}
    >
      {children}
    </button>
  );
}

export const App = () => (
  <div style={{ display: "flex", gap: 8, padding: 16 }}>
    <Tab data-state="active">Active</Tab>
    <Tab data-state="inactive">Inactive</Tab>
  </div>
);

const styles = stylex.create({
  tab: {
    color: "#111",
    borderRadius: "5px",
    boxShadow: {
      default: "none",
      ':is([data-state="active"])': `0 0 0 1px ${$colors.bgBorderThin}`,
    },
  },
  tabActiveDark: {
    backgroundColor: {
      default: null,
      ':is([data-state="active"])': $colors.bgShade,
    },
  },
  tabActiveLight: {
    backgroundColor: {
      default: null,
      ':is([data-state="active"])': $colors.bgBase,
    },
  },
});

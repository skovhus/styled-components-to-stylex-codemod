import React from "react";
import * as stylex from "@stylexjs/stylex";
import { useTheme } from "styled-components";
import { $colors } from "./tokens.stylex";

function Tab(props: { children?: React.ReactNode; "data-state"?: any }) {
  const { children, ...rest } = props;

  const theme = useTheme();

  return (
    <button
      {...rest}
      {...stylex.props(styles.tab, theme.isDark ? styles.tabDark : styles.tabLight)}
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
    boxShadow: "none",
  },
  tabDark: {
    backgroundColor: {
      default: null,
      ':is([data-state="active"])': $colors.bgSub,
    },
    boxShadow: {
      default: null,
      ':is([data-state="active"])': `0 0 0 1px ${$colors.bgBorderFaint}`,
    },
  },
  tabLight: {
    backgroundColor: {
      default: null,
      ':is([data-state="active"])': $colors.bgBase,
    },
    boxShadow: {
      default: null,
      ':is([data-state="active"])': `0 0 0 1px ${$colors.bgBorderFaint}`,
    },
  },
});

import * as React from "react";
import { useTheme } from "styled-components";
import * as stylex from "@stylexjs/stylex";
import { $interaction } from "./lib/interaction.stylex";
import { $colors } from "./tokens.stylex";

function Tab(props: React.PropsWithChildren<{ "data-state"?: boolean | string }>) {
  const theme = useTheme();

  return <button {...props} sx={[styles.tab, theme.isDark ? styles.tabDark : styles.tabLight]} />;
}

type CardButtonProps = React.PropsWithChildren<{
  interactive?: boolean;
}>;

function CardButton(props: CardButtonProps) {
  const { children, interactive } = props;
  return (
    <button sx={[styles.cardButton, interactive && styles.cardButtonInteractive]}>
      {children}
    </button>
  );
}

export const App = () => (
  <div style={{ display: "flex", gap: 8, padding: 16 }}>
    <Tab data-state="active">Active</Tab>
    <Tab data-state="inactive">Inactive</Tab>
    <CardButton interactive>Interactive</CardButton>
  </div>
);

const styles = stylex.create({
  tab: {
    color: "#111",
    borderRadius: 5,
    boxShadow: "none",
  },
  tabDark: {
    backgroundColor: {
      default: null,
      ':is([data-state="active"])': $colors.bgSub,
    },
    boxShadow: {
      default: "none",
      ':is([data-state="active"])': `0 0 0 1px ${$colors.bgBorderFaint}`,
    },
  },
  tabLight: {
    backgroundColor: {
      default: null,
      ':is([data-state="active"])': $colors.bgBase,
    },
    boxShadow: {
      default: "none",
      ':is([data-state="active"])': `0 0 0 1px ${$colors.bgBorderFaint}`,
    },
  },
  cardButton: {
    color: "#334155",
    backgroundColor: "#f8fafc",
  },
  cardButtonInteractive: {
    cursor: "pointer",
    backgroundColor: {
      default: "#f8fafc",
      ":active": $colors.bgBaseHover,
      ":hover": {
        default: "#f8fafc",
        [$interaction.canHover]: $colors.bgBaseHover,
      },
    },
    color: {
      default: "#334155",
      ":active": $colors.labelTitle,
      ":hover": {
        default: "#334155",
        [$interaction.canHover]: $colors.labelTitle,
      },
    },
  },
});

import React from "react";
import * as stylex from "@stylexjs/stylex";
import { useTheme } from "styled-components";
import { $colors } from "./tokens.stylex";

function Container(props: React.PropsWithChildren<{ ref?: React.Ref<HTMLDivElement> }>) {
  const { children } = props;

  const theme = useTheme();

  return (
    <div
      {...stylex.props(
        styles.container,
        theme.isDark ? styles.containerDark : styles.containerLight,
      )}
    >
      {children}
    </div>
  );
}

export const App = () => (
  <Container>
    <button data-state="active" {...stylex.props(styles.tab)}>
      Active Tab
    </button>
    <button data-state="inactive" {...stylex.props(styles.tab)}>
      Inactive Tab
    </button>
    <button data-state="active" {...stylex.props(styles.tab)}>
      Another Active
    </button>
  </Container>
);

const styles = stylex.create({
  container: {
    display: "flex",
    padding: "1px",
    borderRadius: "6px",
  },
  containerDark: {
    backgroundColor: $colors.bgBase,
  },
  containerLight: {
    backgroundColor: $colors.bgSub,
  },
  tab: {
    flex: "1",
    minHeight: "32px",
    fontSize: "14px",
    color: {
      default: "#111",
      ':is([data-state="inactive"])': "#999",
    },
    borderRadius: "5px",
    boxShadow: {
      default: "none",
      ':is([data-state="active"])': `0 0 0 1px ${$colors.bgBorderFaint},0 1px 2px rgba(0, 0, 0, 0.1)`,
    },
    backgroundColor: {
      default: null,
      ':is([data-state="active"])': $colors.bgBase,
    },
  },
});

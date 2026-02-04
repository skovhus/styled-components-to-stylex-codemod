import React from "react";
import * as stylex from "@stylexjs/stylex";
import { pixelVars } from "./tokens.stylex";

export function StyledHeader(props: React.PropsWithChildren<{ ref?: React.Ref<HTMLElement> }>) {
  const { children } = props;

  return <header {...stylex.props(styles.styledHeader)}>{children}</header>;
}

export const App = () => (
  <div {...stylex.props(styles.container)}>
    <StyledHeader>Header 1 (has border because not only child)</StyledHeader>
    <StyledHeader>Header 2 (has border because not only child)</StyledHeader>
    <div style={{ padding: 16, background: "#e0e0e0" }}>
      <StyledHeader>Header 3 (no border - only child of this div)</StyledHeader>
    </div>
  </div>
);

const styles = stylex.create({
  styledHeader: {
    display: "flex",
    padding: "16px",
    backgroundColor: "#f0f0f0",
    borderBottomStyle: {
      default: null,
      ":not(:only-child)": "solid",
    },
    borderBottomColor: {
      default: null,
      ":not(:only-child)": "var(--settings-list-view-border-color)",
    },
    borderBottomWidth: {
      default: null,
      ":not(:only-child)": pixelVars.thin,
    },
  },
  container: {
    "--settings-list-view-border-color": "#bf4f74",
    display: "flex",
    flexDirection: "column",
    gap: "8px",
  },
});

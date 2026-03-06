import React from "react";
import * as stylex from "@stylexjs/stylex";
import { pixelVars } from "./tokens.stylex";

export function StyledHeader(props: Pick<React.ComponentProps<"header">, "ref" | "children">) {
  const { children, ...rest } = props;

  return (
    <header {...rest} sx={styles.styledHeader}>
      {children}
    </header>
  );
}

export const App = () => (
  <div sx={styles.container}>
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

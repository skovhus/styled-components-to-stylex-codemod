// StyledSVG prefix stripping should produce "svg" style key, not "sVG"
import * as React from "react";
import * as stylex from "@stylexjs/stylex";

export function App() {
  return (
    <div style={{ display: "flex", gap: "12px", padding: "16px" }}>
      <svg aria-hidden width={14} height={14} sx={styles.svg}>
        <rect width="14" height="14" fill="coral" />
      </svg>
      <div sx={styles.url}>https://example.com</div>
    </div>
  );
}

const styles = stylex.create({
  svg: {
    alignSelf: "center",
    flexShrink: 0,
  },
  url: {
    color: "blue",
    textDecoration: "underline",
  },
});

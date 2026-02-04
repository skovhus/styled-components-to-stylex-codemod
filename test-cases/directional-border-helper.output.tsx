import React from "react";
import * as stylex from "@stylexjs/stylex";
import { pixelVars, $colors } from "./tokens.stylex";

// Directional border: expands to borderLeftWidth, borderLeftStyle, borderLeftColor
function BorderedLeft(
  props: React.PropsWithChildren<{
    ref?: React.Ref<HTMLDivElement>;
  }>,
) {
  const { children } = props;

  return <div {...stylex.props(styles.borderLeft)}>{children}</div>;
}

// Non-directional border: expands to borderWidth, borderStyle, borderColor
function BorderedBox(
  props: React.PropsWithChildren<{
    ref?: React.Ref<HTMLDivElement>;
  }>,
) {
  const { children } = props;

  return <div {...stylex.props(styles.border)}>{children}</div>;
}

export const App = () => (
  <div style={{ padding: "10px" }}>
    <BorderedLeft>Bordered left</BorderedLeft>
    <BorderedBox>Bordered box</BorderedBox>
  </div>
);

const styles = stylex.create({
  borderLeft: {
    borderLeftWidth: pixelVars.thin,
    borderLeftStyle: "solid",
    borderLeftColor: $colors.labelMuted,
  },
  border: {
    borderWidth: pixelVars.thin,
    borderStyle: "solid",
    borderColor: $colors.labelMuted,
  },
});

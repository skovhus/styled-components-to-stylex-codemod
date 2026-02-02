import * as React from "react";
import * as stylex from "@stylexjs/stylex";
import { pixelVars, $colors } from "./tokens.stylex";

type BorderedLeftProps = React.PropsWithChildren<{
  ref?: React.Ref<HTMLDivElement>;
}>;

// Directional border: expands to borderLeftWidth, borderLeftStyle, borderLeftColor
function BorderedLeft(props: BorderedLeftProps) {
  const { children } = props;
  return <div {...stylex.props(styles.borderLeft)}>{children}</div>;
}

type BorderedBoxProps = React.PropsWithChildren<{
  ref?: React.Ref<HTMLDivElement>;
}>;

// Non-directional border: expands to borderWidth, borderStyle, borderColor
function BorderedBox(props: BorderedBoxProps) {
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

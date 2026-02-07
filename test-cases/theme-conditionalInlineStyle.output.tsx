import * as React from "react";
import { useTheme } from "styled-components";
import * as stylex from "@stylexjs/stylex";
import { $colors } from "./tokens.stylex";

export function Chip(props: React.PropsWithChildren<{ ref?: React.Ref<HTMLDivElement> }>) {
  const { children, ...rest } = props;

  const theme = useTheme();
  const sx = stylex.props(styles.chip);

  return (
    <div
      {...rest}
      {...sx}
      style={{
        ...sx.style,
        backgroundColor: theme.isDark ? theme.highlightVariant(theme.color.bgFocus) : undefined,
      }}
    >
      {children}
    </div>
  );
}

export const App = () => (
  <div style={{ display: "flex", gap: 16, padding: 16 }}>
    <Chip>Default</Chip>
  </div>
);

const styles = stylex.create({
  chip: {
    paddingBlock: "8px",
    paddingInline: "16px",
    backgroundColor: $colors.bgFocus,
  },
});

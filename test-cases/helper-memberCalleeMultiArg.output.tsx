import * as React from "react";
import { useTheme } from "styled-components";
import * as stylex from "@stylexjs/stylex";
import { ColorConverter } from "./lib/helpers";

function Toggle(props: React.PropsWithChildren<{}>) {
  const theme = useTheme();

  return (
    <div
      sx={[
        styles.toggle,
        styles.toggleBackgroundColor(ColorConverter.cssWithAlpha(theme.color.bgBase, 0.4)),
      ]}
    >
      {props.children}
    </div>
  );
}

type BoxProps = React.PropsWithChildren<{
  m: number;
}>;

function Box(props: BoxProps) {
  const { children, m } = props;

  const theme = useTheme();

  return (
    <div
      sx={[
        styles.boxBackgroundColor(ColorConverter.cssWithAlpha(theme.color.bgBase, 0.2)),
        styles.boxMargin(m),
      ]}
    >
      {children}
    </div>
  );
}

export const App = () => (
  <div style={{ display: "flex", gap: 16, padding: 16 }}>
    <Toggle>Toggle</Toggle>
    <Box m={8}>Box with margin</Box>
  </div>
);

const styles = stylex.create({
  toggle: {
    paddingBlock: "8px",
    paddingInline: "16px",
  },
  toggleBackgroundColor: (backgroundColor: string) => ({
    backgroundColor,
  }),
  boxBackgroundColor: (backgroundColor: string) => ({
    backgroundColor,
  }),
  boxMargin: (margin: number) => ({
    margin: `${margin}px`,
  }),
});

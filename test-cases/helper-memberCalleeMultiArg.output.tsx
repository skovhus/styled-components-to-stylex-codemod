import * as React from "react";
import { useTheme } from "styled-components";
import * as stylex from "@stylexjs/stylex";
import { ColorConverter } from "./lib/helpers";

function Toggle(props: React.PropsWithChildren<{}>) {
  const theme = useTheme();

  return (
    <div
      sx={styles.toggle({
        backgroundColor: ColorConverter.cssWithAlpha(theme.color.bgBase, 0.4),
      })}
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
        styles.boxBackgroundColor({
          backgroundColor: ColorConverter.cssWithAlpha(theme.color.bgBase, 0.2),
        }),
        styles.boxMargin({
          margin: m,
        }),
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
  toggle: (props: { backgroundColor: string }) => ({
    paddingBlock: 8,
    paddingInline: 16,
    backgroundColor: props.backgroundColor,
  }),
  boxBackgroundColor: (props: { backgroundColor: string }) => ({
    backgroundColor: props.backgroundColor,
  }),
  boxMargin: (props: { margin: number }) => ({
    margin: `${props.margin}px`,
  }),
});

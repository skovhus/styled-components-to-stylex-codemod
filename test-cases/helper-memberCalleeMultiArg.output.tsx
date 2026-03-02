import React from "react";
import * as stylex from "@stylexjs/stylex";
import { useTheme } from "styled-components";
import { ColorConverter } from "./lib/helpers";

function Toggle(props: React.PropsWithChildren<{}>) {
  const theme = useTheme();

  return (
    <div
      {...stylex.props(
        styles.toggle,
        styles.toggleBackgroundColor(ColorConverter.cssWithAlpha(theme.color.bgBase, 0.4)),
      )}
    >
      {props.children}
    </div>
  );
}

export const App = () => (
  <div style={{ display: "flex", gap: 16, padding: 16 }}>
    <Toggle>Toggle</Toggle>
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
});

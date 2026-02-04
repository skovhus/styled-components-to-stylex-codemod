import React from "react";
import * as stylex from "@stylexjs/stylex";
import { helpers } from "./lib/helpers.stylex";

export function GradientText(props: React.PropsWithChildren<{ ref?: React.Ref<HTMLSpanElement> }>) {
  const { children } = props;

  return <span {...stylex.props(styles.gradientText, helpers.gradient)}>{children}</span>;
}

export const App = () => <GradientText>Gradient text</GradientText>;

const styles = stylex.create({
  gradientText: {
    fontWeight: 600,
  },
});

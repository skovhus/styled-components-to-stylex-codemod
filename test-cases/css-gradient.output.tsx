import React from "react";
import * as stylex from "@stylexjs/stylex";
import { helpers } from "./lib/helpers.stylex";

export function GradientText(props: {
  ref?: React.Ref<HTMLSpanElement>;
  children?: React.ReactNode;
}) {
  const { children, ...rest } = props;

  return (
    <span {...rest} {...stylex.props(helpers.gradient, styles.gradientText)}>
      {children}
    </span>
  );
}

export const App = () => <GradientText>Gradient text</GradientText>;

const styles = stylex.create({
  gradientText: {
    fontWeight: 600,
  },
});

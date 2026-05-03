import React from "react";
import * as stylex from "@stylexjs/stylex";
import { helpers } from "./lib/helpers.stylex";

export function GradientText(props: Pick<React.ComponentProps<"span">, "ref" | "children">) {
  const { children, ...rest } = props;
  return (
    <span {...rest} sx={[helpers.gradient, styles.gradientText]}>
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

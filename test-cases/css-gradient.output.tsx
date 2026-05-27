import React from "react";
import * as stylex from "@stylexjs/stylex";
import { helpers } from "./lib/helpers.stylex";

export function GradientText(props: Pick<React.ComponentProps<"span">, "ref" | "children">) {
  return <span {...props} sx={[helpers.gradient, styles.gradientText]} />;
}

export const App = () => <GradientText>Gradient text</GradientText>;

const styles = stylex.create({
  gradientText: {
    fontWeight: 600,
  },
});

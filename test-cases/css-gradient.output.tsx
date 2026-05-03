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

export const App = () => (
  <div style={{ backgroundColor: "#101828", padding: 16 }}>
    <GradientText>Gradient text sample</GradientText>
  </div>
);

const styles = stylex.create({
  gradientText: {
    fontWeight: 600,
  },
});

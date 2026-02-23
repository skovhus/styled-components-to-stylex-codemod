import React from "react";
import * as stylex from "@stylexjs/stylex";
import { mergedSx } from "./lib/mergedSx";

/**
 * A div with the `contain: paint` CSS property, indicating that children do not paint outside of this element's bounds.
 * This can improve performance, and also fix painting bugs in some browsers.
 */
export function ContainPaint(props: React.ComponentProps<"div">) {
  const { className, children, style, ...rest } = props;

  return (
    <div {...rest} {...mergedSx(styles.containPaint, className, style)}>
      {children}
    </div>
  );
}

export const App = () => (
  <div style={{ display: "flex", gap: 16, padding: 16 }}>
    <ContainPaint>Contained</ContainPaint>
  </div>
);

const styles = stylex.create({
  containPaint: {
    contain: "paint",
  },
});

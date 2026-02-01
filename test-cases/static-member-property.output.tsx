import React from "react";
import * as stylex from "@stylexjs/stylex";

export const Divider = () => {
  return <div role="separator" {...stylex.props(styles.dividerContainer)} />;
};

// Multiple static properties on the same component
Divider.HEIGHT = 10;

Divider.WIDTH = 200;
Divider.BG_COLOR = "#e0e0e0";

export function App() {
  return <Divider />;
}

const styles = stylex.create({
  dividerContainer: {
    paddingBlock: "5px",
    paddingInline: 0,
    /* NOTE: Inlined Divider.HEIGHT as StyleX requires it to be statically evaluable */
    height: "10px",
    /* NOTE: Inlined Divider.WIDTH as StyleX requires it to be statically evaluable */
    width: "200px",
    /* NOTE: Inlined Divider.BG_COLOR as StyleX requires it to be statically evaluable */
    backgroundColor: "#e0e0e0",
  },
});

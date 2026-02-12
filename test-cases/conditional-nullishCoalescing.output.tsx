import React from "react";
import * as stylex from "@stylexjs/stylex";

export const App = () => (
  <div>
    <hr {...stylex.props(styles.divider)} />
    <hr {...stylex.props(styles.divider, styles.dividerBackgroundColor("#bf4f74"))} />
  </div>
);

const styles = stylex.create({
  // Styled hr
  divider: {
    borderWidth: 0,
    borderStyle: "none",
    borderColor: "currentcolor",
    height: "1px",
    backgroundColor: "#e0e0e0",
    marginBlock: "16px",
    marginInline: 0,
  },
  dividerBackgroundColor: (backgroundColor: string) => ({
    backgroundColor,
  }),
});

import * as React from "react";
import * as stylex from "@stylexjs/stylex";
import { InnerSxControl } from "./lib/inner-sx-control";

function StyledControl(
  props: Omit<React.ComponentPropsWithRef<typeof InnerSxControl>, "className" | "style">,
) {
  return <InnerSxControl {...props} {...stylex.props(styles.control)} />;
}

export const App = () => (
  <div style={{ display: "flex", gap: 8, padding: 16 }}>
    <span>Label</span>
    <StyledControl aria-label="Done" />
  </div>
);

const styles = stylex.create({
  control: {
    marginTop: 2,
  },
});

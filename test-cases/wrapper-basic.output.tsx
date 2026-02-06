import * as React from "react";
import * as stylex from "@stylexjs/stylex";

/**
 * A component
 */
export function SomeComponent() {
  const outerRef = React.useRef<HTMLDivElement>(null);
  const innerRef = React.useRef<HTMLDivElement>(null);

  return (
    <div ref={outerRef} tabIndex={-1} {...stylex.props(styles.wrapper)}>
      <div ref={innerRef} style={{ height: 200 }}>
        Scrollable content
      </div>
    </div>
  );
}

export const App = () => (
  <div style={{ padding: 16 }}>
    <SomeComponent />
  </div>
);

const styles = stylex.create({
  wrapper: {
    /* Constrained height to show scroll */
    height: "60px",
    /* Fixed width */
    width: "160px",
    // This is important
    overflowY: "scroll",
    backgroundColor: "#f0f4f8",
    borderRadius: "6px",
    padding: "8px",
    fontSize: "14px",
  },
});

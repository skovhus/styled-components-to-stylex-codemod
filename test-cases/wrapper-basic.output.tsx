import * as React from "react";
import * as stylex from "@stylexjs/stylex";

/**
 * A component
 */
export function SomeComponent() {
  const outerRef = React.useRef<HTMLDivElement>(null);
  const innerRef = React.useRef<HTMLDivElement>(null);

  return (
    <div ref={outerRef} tabIndex={-1} sx={styles.wrapper}>
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
    height: 60,
    /* Fixed width */
    width: 160,
    // This is important
    overflowY: "scroll",
    backgroundColor: "#f0f4f8",
    borderRadius: 6,
    padding: 8,
    fontSize: 14,
  },
});

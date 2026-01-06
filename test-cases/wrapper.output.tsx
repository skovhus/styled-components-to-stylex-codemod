import * as stylex from "@stylexjs/stylex";
import * as React from "react";

/**
 * A component
 */
export function SomeComponent() {
  const outerRef = React.useRef<HTMLDivElement>(null);
  const innerRef = React.useRef<HTMLDivElement>(null);

  return (
    <div ref={outerRef} tabIndex={-1} {...stylex.props(styles.wrapper)}>
      <div ref={innerRef} />
    </div>
  );
}

const styles = stylex.create({
  wrapper: {
    /* A height of 10 */
    height: "10px",
    /* Fixed width */
    width: "50px",
    overflowY: "scroll", // This is important
  },
});

export const App = () => <SomeComponent />;

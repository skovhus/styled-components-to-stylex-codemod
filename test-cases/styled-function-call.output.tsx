import React from "react";
import * as stylex from "@stylexjs/stylex";
import { $colors } from "./tokens.stylex";
import { animated } from "./lib/react-spring";

export function App() {
  return (
    <div>
      <input placeholder="Type here" {...stylex.props(styles.input)} />
      <animated.div {...stylex.props(styles.animatedBox)}>Animated content</animated.div>
    </div>
  );
}

// Bug 3a: styled(Component) function call syntax should transform properly.
// This includes both styled("tagName") and styled(ImportedComponent).

const styles = stylex.create({
  // Pattern 1: styled("tagName") - string tag name
  input: {
    height: "32px",
    padding: "8px",
    backgroundColor: "white",
    borderWidth: "1px",
    borderStyle: "solid",
    borderColor: "#ccc",
  },

  // Pattern 2: styled(Component) - imported component (e.g., from react-spring)
  animatedBox: {
    padding: "16px",
    backgroundColor: "blue",
    color: "white",
    borderWidth: "1px",
    borderStyle: "solid",
    borderColor: $colors.primaryColor,
  },
});

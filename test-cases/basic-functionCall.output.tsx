import React from "react";
import * as stylex from "@stylexjs/stylex";
import { $colors } from "./tokens.stylex";
import { animated } from "./lib/react-spring";

export function App() {
  return (
    <div>
      <input placeholder="Type here" sx={styles.input} />
      <animated.div {...stylex.props(styles.animatedBox)}>Animated content</animated.div>
    </div>
  );
}

// Bug 3a: styled(Component) function call syntax should transform properly.
// This includes both styled("tagName") and styled(ImportedComponent).

const styles = stylex.create({
  // Pattern 1: styled("tagName") - string tag name
  input: {
    height: 32,
    padding: 8,
    backgroundColor: "white",
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: "#ccc",
  },
  // Pattern 2: styled(Component) - imported component (e.g., from react-spring)
  animatedBox: {
    padding: 16,
    backgroundColor: "blue",
    color: "white",
    borderWidth: "1px",
    borderStyle: "solid",
    borderColor: $colors.primaryColor,
  },
});

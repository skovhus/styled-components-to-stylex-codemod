import * as React from "react";
import * as stylex from "@stylexjs/stylex";
import { animated } from "./lib/react-spring";

// styled(Component.sub).attrs() - MemberExpression with attrs
function AnimatedBox(props: { children?: React.ReactNode }) {
  return <animated.div {...props} role="region" {...stylex.props(styles.animatedBox)} />;
}

export const App = () => (
  <div sx={styles.simpleBox}>
    <AnimatedBox>Hello</AnimatedBox>
  </div>
);

const styles = stylex.create({
  // Test: styled(MemberExpression).attrs() pattern
  // This tests that styled(animated.div).attrs() is correctly transformed,
  // similar to styled(Component).attrs() where Component is an Identifier.
  // Simple styled component
  simpleBox: {
    display: "block",
  },
  animatedBox: {
    display: "flex",
    alignItems: "center",
  },
});

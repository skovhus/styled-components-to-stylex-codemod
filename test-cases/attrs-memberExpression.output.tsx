import * as stylex from "@stylexjs/stylex";
import { animated } from "./lib/react-spring";

export const App = () => (
  <div {...stylex.props(styles.simpleBox)}>
    <animated.div role="region" {...stylex.props(styles.animatedBox)}>
      Hello
    </animated.div>
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
  // styled(Component.sub).attrs() - MemberExpression with attrs
  animatedBox: {
    display: "flex",
    alignItems: "center",
  },
});

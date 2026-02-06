import { animated, useSpring } from "./lib/react-spring";
import * as stylex from "@stylexjs/stylex";

// Bug: The codemod emits `const styles = stylex.create(...)` but `styles` is already
// used by `const [styles, api] = useSpring(...)`. The `stylex.props(styles.styledPath)`
// call then indexes into the useSpring result instead of the stylex styles. Causes TS2339.

function ChevronHandle() {
  const [styles, api] = useSpring(() => ({
    d: "M2 3L11 5L20 3",
    y: 0,
  }));

  return (
    <svg width="22" height="6">
      <animated.path d={styles.d} {...stylex.props(stylexStyles.styledPath)} />
    </svg>
  );
}

export const App = () => <ChevronHandle />;

const stylexStyles = stylex.create({
  styledPath: {
    stroke: "currentColor",
    strokeWidth: 2,
    strokeLinecap: "round",
  },
});

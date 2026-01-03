import * as stylex from "@stylexjs/stylex";

// NOTE: This fixture is intentionally excluded from Storybook/test pairing by the `_unsupported-` prefix.
// Universal selectors (e.g. `& *`, `&:hover *`) are not currently representable in StyleX.

const styles = stylex.create({
  container: {
    display: "block",
  },
});

export const App = () => <div {...stylex.props(styles.container)}>Unsupported universal selectors</div>;



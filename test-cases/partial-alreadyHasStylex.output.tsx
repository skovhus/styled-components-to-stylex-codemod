// Partial migration: file already has StyleX AND styled-components mixed.
// The codemod should convert the remaining styled-components into the existing
// StyleX setup so the output is fully StyleX.
import * as stylex from "@stylexjs/stylex";

const styles = stylex.create({
  heading: {
    color: "navy",
    fontSize: 24,
  },
  container: {
    padding: 12,
    backgroundColor: "papayawhip",
  },
});

export const App = () => (
  <div>
    <div sx={styles.container}>converted by codemod</div>
    <h1 {...stylex.props(styles.heading)}>already stylex</h1>
  </div>
);

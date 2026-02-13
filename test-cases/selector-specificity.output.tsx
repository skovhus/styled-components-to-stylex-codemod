import * as stylex from "@stylexjs/stylex";

export const App = () => (
  <div style={{ display: "flex", gap: 16, padding: 16 }}>
    <div {...stylex.props(styles.thing)}>High specificity text (red, with padding)</div>
  </div>
);

const styles = stylex.create({
  thing: {
    /* Specificity hack stripped (was: &&) */
    color: "red",
    padding: "8px",
  },
});

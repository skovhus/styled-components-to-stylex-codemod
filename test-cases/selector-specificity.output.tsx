import * as stylex from "@stylexjs/stylex";

export const App = () => (
  <div style={{ display: "flex", gap: 16, padding: 16 }}>
    <div {...stylex.props(styles.thing)}>High specificity text (blue due to &&&, with padding)</div>
  </div>
);

const styles = stylex.create({
  thing: {
    /* Specificity hack stripped (was: &&&) */
    color: "blue",
    padding: "8px",
  },
});

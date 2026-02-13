import * as stylex from "@stylexjs/stylex";

export const App = () => (
  <div>
    <div {...stylex.props(styles.thing)}>Higher specificity text (red due to &&)</div>
  </div>
);

const styles = stylex.create({
  thing: {
    /* Double ampersand increases specificity */
    color: "red",
  },
});

import * as stylex from "@stylexjs/stylex";

export const App = () => (
  <div>
    <div {...stylex.props(styles.thing)}>High specificity text (blue due to &&&)</div>
  </div>
);

const styles = stylex.create({
  thing: {
    /* Triple ampersand for even higher specificity */
    color: "blue",
  },
});

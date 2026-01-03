import * as stylex from "@stylexjs/stylex";

const styles = stylex.create({
  thing: {
    color: "blue",
  },
  overrideStyles: {
    backgroundColor: "papayawhip",
  },
});

export const App = () => (
  <div className="wrapper">
    <div {...stylex.props(styles.thing)}>High specificity text (blue due to &&&)</div>
    <div {...stylex.props(styles.overrideStyles)}>Context override (papayawhip background)</div>
  </div>
);

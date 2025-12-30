import * as stylex from "@stylexjs/stylex";

const styles = stylex.create({
  equalDivider: {
    display: "flex",
    margin: "0.5rem",
    padding: "1rem",
    backgroundColor: "papayawhip",
  },
  child: {
    flex: 1,
  },
  childNotFirst: {
    marginLeft: "1rem",
  },
});

export const App = () => (
  <div {...stylex.props(styles.equalDivider)}>
    <div {...stylex.props(styles.child)}>First</div>
    <div {...stylex.props(styles.child, styles.childNotFirst)}>Second</div>
    <div {...stylex.props(styles.child, styles.childNotFirst)}>Third</div>
  </div>
);
